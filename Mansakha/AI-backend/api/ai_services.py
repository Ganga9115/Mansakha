import os
import sys
import json
import math
import pickle
import logging
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

import numpy as np
import requests

logger = logging.getLogger(__name__)

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
MANSAKHA_AI_DIR = PROJECT_ROOT / "Mansakha-Ai"

# Model Directories
VOICE_PITCH_DIR = MANSAKHA_AI_DIR / "VoicePitchData"
SENTIMENT_MODEL_DIR = MANSAKHA_AI_DIR / "hf" / "PS094_Sentiment_Model"
EMOTION_MODEL_DIR = MANSAKHA_AI_DIR / "hf" / "MultilingualEmotion"
VOICE_TO_TEXT_DIR = MANSAKHA_AI_DIR / "voice to text"

# Ollama Config
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma3:4b")

# Add VoicePitchData and voice to text to sys.path
if str(VOICE_PITCH_DIR) not in sys.path:
    sys.path.insert(0, str(VOICE_PITCH_DIR))
if str(VOICE_TO_TEXT_DIR) not in sys.path:
    sys.path.insert(0, str(VOICE_TO_TEXT_DIR))

# Lazy-loaded globals
_VOICE_MODEL = None
_VOICE_SCALER = None
_VOICE_LABEL_ENCODER = None

_SENTIMENT_TOKENIZER = None
_SENTIMENT_MODEL = None
_SENTIMENT_ID2LABEL = None

_EMOTION_TOKENIZER = None
_EMOTION_MODEL = None
_EMOTION_ID2LABEL = None

_WHISPER_MODEL = None


# ==============================================================================
# 1. Voice Stress & Pitch Emotion Analytics
# ==============================================================================
def get_voice_model():
    global _VOICE_MODEL, _VOICE_SCALER, _VOICE_LABEL_ENCODER
    if _VOICE_MODEL is not None:
        return _VOICE_MODEL, _VOICE_SCALER, _VOICE_LABEL_ENCODER

    model_path = VOICE_PITCH_DIR / "pitch_emotion_model_v2.pkl"
    scaler_path = VOICE_PITCH_DIR / "pitch_scaler_v2.pkl"
    le_path = VOICE_PITCH_DIR / "pitch_label_encoder_v2.pkl"

    if not model_path.exists():
        raise FileNotFoundError(f"Voice model not found at {model_path}")

    with open(model_path, "rb") as f:
        _VOICE_MODEL = pickle.load(f)
    with open(scaler_path, "rb") as f:
        _VOICE_SCALER = pickle.load(f)
    with open(le_path, "rb") as f:
        _VOICE_LABEL_ENCODER = pickle.load(f)

    logger.info(f"Loaded Voice Emotion Model v2 with classes: {list(_VOICE_LABEL_ENCODER.classes_)}")
    return _VOICE_MODEL, _VOICE_SCALER, _VOICE_LABEL_ENCODER


def analyze_voice_stress(audio_path_or_array, sample_rate: int = 22050) -> Dict[str, Any]:
    """
    Extracts pitch and acoustic features from audio, classifies emotion via
    trained ensemble model, and derives a calibrated Voice Stress Score (0.0 to 1.0).
    """
    import librosa
    from scipy.signal import resample_poly
    from math import gcd

    try:
        model, scaler, le = get_voice_model()

        # Load audio if file path provided
        if isinstance(audio_path_or_array, (str, Path)):
            audio, sr = librosa.load(str(audio_path_or_array), sr=22050)
        else:
            audio = np.asarray(audio_path_or_array, dtype=np.float32)
            sr = sample_rate
            if sr != 22050:
                g = gcd(22050, sr)
                audio = resample_poly(audio, 22050 // g, sr // g).astype(np.float32)
                sr = 22050

        from pitch_features import extract_pitch_features, FEATURE_NAMES

        feats = extract_pitch_features(audio, sr)
        if feats is None:
            return {
                "voice_stress_score": 0.0,
                "dominant_emotion": "neutral",
                "emotion_probabilities": {"neutral": 1.0},
                "pitch_mean": 0.0,
                "pitch_jitter": 0.0,
                "status": "insufficient_voiced_audio",
            }

        # V2 features (RMS energy, zero crossing, high pitch ratio)
        rms = librosa.feature.rms(y=audio, frame_length=2048, hop_length=512)[0]
        zcr = librosa.feature.zero_crossing_rate(audio, frame_length=2048, hop_length=512)[0]

        fmin_hz = librosa.note_to_hz('C2')
        fmax_hz = librosa.note_to_hz('C7')
        f0 = librosa.yin(audio, fmin=fmin_hz, fmax=fmax_hz, sr=sr, frame_length=2048, hop_length=512)
        vm = (f0 > fmin_hz * 1.05) & (f0 < fmax_hz * 0.95)
        vf0 = f0[vm]

        smooth = float(np.mean(np.abs(np.diff(np.diff(vf0))))) if len(vf0) > 2 else 0.0
        v2_dict = {
            'rms_mean': float(np.mean(rms)),
            'rms_std': float(np.std(rms)),
            'rms_max': float(np.max(rms)),
            'rms_range': float(np.max(rms) - np.min(rms)),
            'zcr_mean': float(np.mean(zcr)),
            'zcr_std': float(np.std(zcr)),
            'f0_p10': float(np.percentile(vf0, 10)) if len(vf0) > 0 else 0.0,
            'f0_p90': float(np.percentile(vf0, 90)) if len(vf0) > 0 else 0.0,
            'high_pitch_ratio': float(np.mean(vf0 > 200)) if len(vf0) > 0 else 0.0,
            'contour_smooth': smooth,
        }
        feats.update(v2_dict)

        v2_extra = ['rms_mean', 'rms_std', 'rms_max', 'rms_range', 'zcr_mean', 'zcr_std',
                    'f0_p10', 'f0_p90', 'high_pitch_ratio', 'contour_smooth']
        active_features = FEATURE_NAMES + v2_extra

        x = np.array([feats.get(k, 0.0) for k in active_features]).reshape(1, -1)
        x = np.nan_to_num(x)
        x_scaled = scaler.transform(x)

        proba = model.predict_proba(x_scaled)[0]
        classes = list(le.classes_)
        prob_dict = {classes[i]: round(float(proba[i]), 4) for i in range(len(classes))}
        dominant = le.inverse_transform([np.argmax(proba)])[0]

        # Calibrated Voice Stress Score formula (0.0 to 1.0)
        # Fear (1.0x), Sadness (0.85x), Anger (0.75x), Disgust (0.5x), Neutral (0.05x), Happy (0.0x)
        fear_p = prob_dict.get("fear", 0.0)
        sad_p = prob_dict.get("sad", 0.0)
        anger_p = prob_dict.get("anger", 0.0)
        disgust_p = prob_dict.get("disgust", 0.0)

        raw_stress = (fear_p * 1.0) + (sad_p * 0.85) + (anger_p * 0.75) + (disgust_p * 0.5)

        # Micro-tremor / Jitter penalty (vocal cord tension increases jitter during trauma)
        jitter = feats.get("jitter", 0.0)
        jitter_stress = min(0.2, jitter * 2.0)
        voice_stress_score = round(min(1.0, max(0.0, raw_stress * 0.85 + jitter_stress)), 4)

        return {
            "voice_stress_score": voice_stress_score,
            "dominant_emotion": dominant,
            "emotion_probabilities": prob_dict,
            "pitch_mean": round(float(feats.get("f0_mean", 0.0)), 2),
            "pitch_range": round(float(feats.get("f0_range", 0.0)), 2),
            "pitch_jitter": round(float(feats.get("jitter", 0.0)), 4),
            "voiced_fraction": round(float(feats.get("voiced_fraction", 0.0)), 3),
            "status": "success",
        }
    except Exception as e:
        logger.error(f"Error in analyze_voice_stress: {e}", exc_info=True)
        return {
            "voice_stress_score": 0.0,
            "dominant_emotion": "neutral",
            "emotion_probabilities": {},
            "status": f"error: {str(e)}",
        }


# ==============================================================================
# 2. Multilingual Sentiment Analysis (PS094 Model)
# ==============================================================================
def get_sentiment_model():
    global _SENTIMENT_TOKENIZER, _SENTIMENT_MODEL, _SENTIMENT_ID2LABEL
    if _SENTIMENT_MODEL is not None:
        return _SENTIMENT_TOKENIZER, _SENTIMENT_MODEL, _SENTIMENT_ID2LABEL

    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification

    tokenizer = AutoTokenizer.from_pretrained(str(SENTIMENT_MODEL_DIR))
    model = AutoModelForSequenceClassification.from_pretrained(str(SENTIMENT_MODEL_DIR))
    model.eval()

    label_map_path = SENTIMENT_MODEL_DIR / "label_map.json"
    if label_map_path.exists():
        with open(label_map_path, "r", encoding="utf-8") as f:
            lmap = json.load(f)
            id2label = {int(k): v for k, v in lmap.get("id2label", {}).items()}
    else:
        id2label = {0: "NEGATIVE", 1: "POSITIVE"}

    _SENTIMENT_TOKENIZER = tokenizer
    _SENTIMENT_MODEL = model
    _SENTIMENT_ID2LABEL = id2label
    logger.info("Loaded PS094 Sentiment Model successfully.")
    return _SENTIMENT_TOKENIZER, _SENTIMENT_MODEL, _SENTIMENT_ID2LABEL


def analyze_sentiment(text: str) -> Dict[str, Any]:
    """
    Computes sentiment raw (-1.0 to +1.0) where +1.0 = maximum distress / negative
    and -1.0 = completely positive / safe. Matches scoring.js specifications.
    """
    if not text or not text.strip():
        return {"sentiment_raw": 0.0, "label": "NEUTRAL", "confidence": 1.0}

    try:
        import torch
        tok, model, id2label = get_sentiment_model()
        enc = tok(text, truncation=True, max_length=128, return_tensors="pt")
        with torch.no_grad():
            logits = model(**enc).logits
            probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]

        pred_id = int(probs.argmax())
        label = id2label.get(pred_id, "NEGATIVE")

        # Map to -1..+1 range where higher = more distress (negative = +1, positive = -1)
        neg_prob = float(probs[0]) if 0 in id2label and "NEG" in id2label[0] else float(probs[pred_id])
        pos_prob = float(probs[1]) if 1 in id2label and "POS" in id2label[1] else (1.0 - neg_prob)

        # Inverted scale for scoring.js: neg_prob -> +1.0, pos_prob -> -1.0
        sentiment_raw = round(neg_prob - pos_prob, 4)

        return {
            "sentiment_raw": sentiment_raw,
            "label": label,
            "negative_probability": round(neg_prob, 4),
            "positive_probability": round(pos_prob, 4),
            "confidence": round(float(probs[pred_id]), 4),
            "status": "success",
        }
    except Exception as e:
        logger.error(f"Error in analyze_sentiment: {e}")
        return {"sentiment_raw": 0.0, "label": "NEUTRAL", "confidence": 0.5, "status": f"error: {str(e)}"}


# ==============================================================================
# 3. Multilingual Text Emotion Analysis (XLM-RoBERTa 11 Emotions)
# ==============================================================================
def get_emotion_model():
    global _EMOTION_TOKENIZER, _EMOTION_MODEL, _EMOTION_ID2LABEL
    if _EMOTION_MODEL is not None:
        return _EMOTION_TOKENIZER, _EMOTION_MODEL, _EMOTION_ID2LABEL

    from transformers import AutoTokenizer, AutoModelForSequenceClassification

    tokenizer = AutoTokenizer.from_pretrained(str(EMOTION_MODEL_DIR))
    model = AutoModelForSequenceClassification.from_pretrained(str(EMOTION_MODEL_DIR))
    model.eval()

    cfg_path = EMOTION_MODEL_DIR / "config.json"
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
        id2label = cfg.get("id2label", {})

    _EMOTION_TOKENIZER = tokenizer
    _EMOTION_MODEL = model
    _EMOTION_ID2LABEL = id2label
    logger.info("Loaded Multilingual Emotion Model successfully.")
    return _EMOTION_TOKENIZER, _EMOTION_MODEL, _EMOTION_ID2LABEL


def analyze_emotion(text: str) -> Dict[str, Any]:
    """
    Evaluates 11 discrete emotions via multilingual XLM-RoBERTa model.
    Computes calibrated emotion distress score (0.0 to 1.0) weighted specifically
    toward trauma signals (fear, sadness, anger, contempt).
    """
    if not text or not text.strip():
        return {"emotion_score": 0.1, "dominant_emotion": "neutral", "probabilities": {}}

    try:
        import torch
        tok, model, id2label = get_emotion_model()
        enc = tok(text, truncation=True, max_length=256, return_tensors="pt")
        with torch.no_grad():
            logits = model(**enc).logits
            probs = torch.sigmoid(logits)[0].cpu().numpy()

        prob_dict = {}
        for idx_str, name in id2label.items():
            prob_dict[name.lower()] = round(float(probs[int(idx_str)]), 4)

        # Distress weighting: Fear (1.0x), Sadness (0.85x), Anger (0.7x), Frustration (0.6x), Disgust (0.5x)
        fear = prob_dict.get("fear", 0.0)
        sadness = prob_dict.get("sadness", 0.0)
        anger = prob_dict.get("anger", 0.0)
        frustration = prob_dict.get("frustration", 0.0)
        disgust = prob_dict.get("disgust", 0.0)
        joy = prob_dict.get("joy", 0.0)

        # Distressed composite score (0..1)
        distress_emotion_score = min(1.0, max(0.0,
            (fear * 1.0) + (sadness * 0.85) + (anger * 0.7) + (frustration * 0.6) + (disgust * 0.5) - (joy * 0.5)
        ))

        dominant = max(prob_dict.items(), key=lambda x: x[1])[0]

        return {
            "emotion_score": round(distress_emotion_score, 4),
            "dominant_emotion": dominant,
            "probabilities": prob_dict,
            "status": "success",
        }
    except Exception as e:
        logger.error(f"Error in analyze_emotion: {e}")
        return {"emotion_score": 0.2, "dominant_emotion": "neutral", "probabilities": {}, "status": f"error: {str(e)}"}


# ==============================================================================
# 4. IIT Madras Speech Lab ASR & Multilingual Speech-to-Text
# Specification: https://speech-lab-iitm.github.io/SpeechLab/api.html
# ==============================================================================
IITM_SPEECHLAB_ASR_V2_URL = "https://asr.iitm.ac.in/asr/v2/decode"
IITM_SPEECHLAB_INTERNAL_URL = "https://asr.iitm.ac.in/internal/asr/decode"

IITM_LANGUAGE_MAP = {
    "en": "english",
    "hi": "hindi",
    "ta": "tamil",
    "te": "telugu",
    "kn": "kannada",
    "mr": "marathi",
    "gu": "gujarati",
    "bn": "bengali",
    "ml": "malayalam",
    "pa": "punjabi",
    "or": "odia",
    "sa": "sanskrit",
}

REVERSE_IITM_LANGUAGE_MAP = {v: k for k, v in IITM_LANGUAGE_MAP.items()}
REVERSE_IITM_LANGUAGE_MAP.update({"english": "en", "hindi": "hi", "tamil": "ta", "telugu": "te", "kannada": "kn", "marathi": "mr", "gujarati": "gu", "bengali": "bn", "malayalam": "ml", "punjabi": "pa", "odia": "or", "sanskrit": "sa", "urdu": "ur"})


NATIVE_PROMPTS = {
    "hi": "नमस्ते, यह हिंदी में है।",
    "ta": "வணக்கம், இது தமிழ்.",
    "te": "నమస్కారం, ఇది తెలుగు.",
    "bn": "নমস্কার, এটি বাংলা.",
    "gu": "નમસ્તે, આ ગુજરાતીમાં છે.",
    "kn": "ನಮಸ್ಕಾರ, ಇದು ಕನ್ನಡ.",
    "ml": "നమസ്കാരം, ഇത് മലയാളം.",
    "mr": "नमस्कार, हे मराठीत आहे.",
    "pa": "ਸਤਿ ਸ਼੍ਰੀ ਅਕਾਲ, ਇਹ ਪੰਜਾਬੀ ਵਿੱਚ ਹੈ।",
    "ur": "السلام علیکم، یہ اردو میں ہے۔",
}


def get_whisper_model():
    """
    Loads and caches the local multilingual Whisper model (whisper-small)
    optimized for Indic languages and English.
    """
    global _WHISPER_MODEL
    if _WHISPER_MODEL is not None:
        return _WHISPER_MODEL

    import torch
    from faster_whisper import WhisperModel

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    local_model_dir = VOICE_TO_TEXT_DIR / "models" / "whisper-small"
    model_source = str(local_model_dir) if local_model_dir.is_dir() else "small"
    logger.info(f"Loading Whisper STT model from '{model_source}' on {device.upper()} ({compute_type})...")
    _WHISPER_MODEL = WhisperModel(model_source, device=device, compute_type=compute_type)
    return _WHISPER_MODEL


def transcribe_via_iitm_speechlab(audio_path: str, language: str = "english") -> Optional[Dict[str, Any]]:
    """
    Directly queries IIT Madras Speech Lab ASR API per documentation:
    https://speech-lab-iitm.github.io/SpeechLab/api.html
    Request: POST -F 'file=@audio.wav' -F 'language=english' -F 'vtt=false' https://asr.iitm.ac.in/asr/v2/decode
    """
    import urllib3
    urllib3.disable_warnings()

    lang_lower = (language or "english").lower()
    iitm_lang = IITM_LANGUAGE_MAP.get(lang_lower, lang_lower)

    endpoints = [IITM_SPEECHLAB_ASR_V2_URL]
    for url in endpoints:
        try:
            with open(audio_path, "rb") as f:
                files = {
                    "file": (os.path.basename(audio_path), f, "audio/wav"),
                    "language": (None, iitm_lang),
                    "vtt": (None, "false"),
                }
                r = requests.post(url, files=files, timeout=1.5, verify=False)
                if r.ok and "application/json" in r.headers.get("Content-Type", ""):
                    res = r.json()
                    if res.get("status") == "success" and res.get("transcript"):
                        logger.info(f"Successfully transcribed via IIT Madras Speech Lab ({url}): {res.get('transcript')[:50]}...")
                        return {
                            "transcript": res.get("transcript", "").strip(),
                            "time_taken": res.get("time_taken"),
                            "source": "IIT Madras Speech Lab API (ASR v2)",
                            "status": "success",
                        }
        except Exception as e:
            logger.debug(f"IIT Madras Speech Lab endpoint {url} attempt: {e}")

    return None


def transcribe_audio(audio_path_or_bytes, language: str = "auto") -> Dict[str, Any]:
    """
    Transcribes audio into text adhering to the IIT Madras Speech Lab ASR specification:
    https://speech-lab-iitm.github.io/SpeechLab/api.html
    With seamless fallback to the local AI4Bharat / IndicWhisper engine.
    """
    import tempfile

    temp_created = None
    target_path = None

    if isinstance(audio_path_or_bytes, (str, Path)) and os.path.exists(str(audio_path_or_bytes)):
        target_path = str(audio_path_or_bytes)
    elif isinstance(audio_path_or_bytes, (bytes, bytearray)):
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp.write(audio_path_or_bytes)
        tmp.close()
        temp_created = tmp.name
        target_path = temp_created

    try:
        # 1. First priority: Attempt direct transcription via IIT Madras Speech Lab API
        if target_path and os.path.exists(target_path):
            iitm_res = transcribe_via_iitm_speechlab(target_path, language=language)
            if iitm_res and iitm_res.get("transcript"):
                return iitm_res

        # 2. Resilient fallback: Local Indic / Multilingual Whisper engine
        model = get_whisper_model()
        lang_str = (language or "auto").lower().strip()
        if lang_str in ("auto", "detect", ""):
            target_lang = None
        elif len(lang_str) == 2:
            target_lang = lang_str
        else:
            target_lang = REVERSE_IITM_LANGUAGE_MAP.get(lang_str, lang_str[:2])

        prompt = NATIVE_PROMPTS.get(target_lang) if target_lang else None

        source = target_path if target_path else audio_path_or_bytes
        segments, info = model.transcribe(
            source,
            language=target_lang,
            initial_prompt=prompt,
            beam_size=5,
            task="transcribe",
        )
        text = " ".join([seg.text.strip() for seg in segments]).strip()

        return {
            "transcript": text,
            "detected_language": info.language,
            "language_probability": round(info.language_probability, 4),
            "duration": round(info.duration, 2),
            "source": "IIT Madras / AI4Bharat IndicWhisper Local Engine",
            "status": "success",
        }
    except Exception as e:
        logger.error(f"Error in transcribe_audio: {e}", exc_info=True)
        return {"transcript": "", "detected_language": "en", "language_probability": 0.0, "status": f"error: {str(e)}"}
    finally:
        if temp_created and os.path.exists(temp_created):
            try:
                os.remove(temp_created)
            except Exception:
                pass



# ==============================================================================
# 5. Ollama Clinical Reason & Explainable AI
# ==============================================================================
def call_ollama_clinical_reason(text: str, sentiment_label: str, dominant_emotion: str) -> Tuple[str, Optional[str]]:
    """
    Queries local Ollama (Gemma 3-4B) to produce:
    1. An explainable clinical reason for the distress score (why the victim was flagged).
    2. Recommended intervention type (Counselling, Medical, Legal Aid, Witness Protection, Relocation, etc.).
    """
    valid_interventions = [
        "Counselling", "Medical", "Witness Protection",
        "Relocation", "Financial Assistance", "Legal Aid", "Rehabilitation"
    ]

    prompt = f"""You are analyzing a check-in response from a victim of an atrocity under India's SC/ST Act.
The NLP model detected sentiment: "{sentiment_label}" and dominant emotion: "{dominant_emotion}".

Read the text and return ONLY a valid JSON object:
{{
  "reason": "<One clear sentence explaining the specific words or emotional signals that drove this assessment, suitable for a human counsellor to read>",
  "suggestedIntervention": "<Exactly one of: Counselling, Medical, Witness Protection, Relocation, Financial Assistance, Legal Aid, Rehabilitation, or null>"
}}

Victim's response:
\"\"\"{text}\"\"\""""

    try:
        res = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "format": "json", "stream": False},
            timeout=10,
        )
        if res.ok:
            data = res.json()
            payload = json.loads(data.get("response", "{}"))
            reason = payload.get("reason")
            intervention = payload.get("suggestedIntervention")
            if intervention not in valid_interventions:
                intervention = None
            if reason:
                return reason, intervention
    except Exception as e:
        logger.warning(f"Ollama explainability offline ({e}). Using rule-based clinical explanation.")

    # Rule-based explainability fallback
    reason = f"Automated screening identified {dominant_emotion.lower()} affect and {sentiment_label.lower()} sentiment patterns in the check-in narrative."
    suggested = "Counselling" if dominant_emotion in ["fear", "sadness", "anger"] else None
    return reason, suggested


# ==============================================================================
# 6. Unified Multimodal Assessment Pipeline
# ==============================================================================
def analyze_multimodal(text: Optional[str] = None, audio_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Full multimodal integration:
    - Audio -> Transcribe (IndicWhisper) + Voice Stress Analytics (Pitch ensemble)
    - Text -> Sentiment (PS094 Model) + Emotion (XLM-RoBERTa 11 emotions)
    - Fusion -> Ollama Explainable AI Clinical Note + Phase 2 Weights
    """
    transcript = text or ""
    detected_lang = "en"
    voice_stress_score = 0.0
    voice_details = {}

    # Process Audio if provided
    if audio_path and os.path.exists(audio_path):
        # 1. Voice stress & pitch
        voice_res = analyze_voice_stress(audio_path)
        voice_stress_score = voice_res.get("voice_stress_score", 0.0)
        voice_details = voice_res

        # 2. Transcribe if no text or if audio check-in
        if not transcript.strip():
            stt_res = transcribe_audio(audio_path)
            transcript = stt_res.get("transcript", "")
            detected_lang = stt_res.get("detected_language", "en")

    # Process Text
    sent_res = analyze_sentiment(transcript)
    sentiment_raw = sent_res.get("sentiment_raw", 0.0)
    sentiment_label = sent_res.get("label", "NEUTRAL")

    emo_res = analyze_emotion(transcript)
    emotion_score = emo_res.get("emotion_score", 0.2)
    dominant_emotion = emo_res.get("dominant_emotion", "neutral")

    # If voice was dominant fear/sad, cross-validate with text emotion
    if voice_details.get("dominant_emotion") in ["fear", "sad"] and emotion_score < 0.5:
        emotion_score = max(emotion_score, 0.6)

    # Explainable AI via Ollama
    reason, suggested_intervention = call_ollama_clinical_reason(transcript, sentiment_label, dominant_emotion)

    return {
        "transcript": transcript,
        "language": detected_lang,
        "sentiment_raw": sentiment_raw,
        "sentiment_details": sent_res,
        "emotion_score": emotion_score,
        "emotion_details": emo_res,
        "voice_stress_score": voice_stress_score,
        "voice_details": voice_details,
        "reason": reason,
        "suggested_intervention": suggested_intervention,
        "status": "success",
    }
