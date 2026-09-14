import os
import sys

# Reconfigure stdout/stderr for UTF-8 on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import shutil
import numpy as np
import torch
from typing import Optional, Union, Tuple, Dict, Any

# Ensure PyTorch CUDA DLLs (cuBLAS, etc.) are discovered on Windows
torch_lib = os.path.join(os.path.dirname(torch.__file__), "lib")
if os.path.isdir(torch_lib):
    if hasattr(os, "add_dll_directory"):
        try:
            os.add_dll_directory(torch_lib)
        except Exception:
            pass
    if torch_lib not in os.environ.get("PATH", ""):
        os.environ["PATH"] = torch_lib + os.pathsep + os.environ.get("PATH", "")

# Global model cache
_MODEL = None

SUPPORTED_LANGUAGES = {
    "auto": {"name": "Auto Detect", "native": "✨ Auto Detect"},
    "hi": {"name": "Hindi", "native": "हिन्दी"},
    "ta": {"name": "Tamil", "native": "தமிழ்"},
    "te": {"name": "Telugu", "native": "తెలుగు"},
    "bn": {"name": "Bengali", "native": "বাংলা"},
    "gu": {"name": "Gujarati", "native": "ગુજરાતી"},
    "kn": {"name": "Kannada", "native": "ಕನ್ನಡ"},
    "ml": {"name": "Malayalam", "native": "മലയാളം"},
    "mr": {"name": "Marathi", "native": "मराठी"},
    "pa": {"name": "Punjabi", "native": "ਪੰਜਾਬੀ"},
    "ur": {"name": "Urdu", "native": "اردو"},
    "en": {"name": "English", "native": "English"},
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "models", "whisper-small")

NATIVE_PROMPTS = {
    "hi": "नमस्ते, यह हिंदी में है।",
    "ta": "வணக்கம், இது தமிழ்.",
    "te": "నమస్కారం, ఇది తెలుగు.",
    "bn": "নমস্কার, এটি বাংলা.",
    "gu": "નમસ્તે, આ ગુજરાતીમાં છે.",
    "kn": "ನಮಸ್ಕಾರ, ಇದು ಕನ್ನಡ.",
    "ml": "നമസ്കാരം, ഇത് മലയാളം.",
    "mr": "नमस्कार, हे मराठीत आहे.",
    "pa": "ਸਤਿ ਸ਼੍ਰੀ ਅਕਾਲ, ਇਹ ਪੰਜਾਬੀ ਵਿੱਚ ਹੈ।",
    "ur": "السلام علیکم، یہ اردو میں ہے۔",
}

def get_model():
    """
    Loads and caches the upgraded multilingual Whisper model on GPU with float16.
    """
    global _MODEL
    if _MODEL is not None:
        return _MODEL

    from faster_whisper import WhisperModel
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    
    model_source = MODEL_DIR if os.path.isdir(MODEL_DIR) else "small"
    print(f"Loading upgraded Whisper model from '{model_source}' on {device.upper()} ({compute_type})...")
    _MODEL = WhisperModel(model_source, device=device, compute_type=compute_type)
    return _MODEL

def transcribe(
    audio_input: Union[str, np.ndarray, Tuple[int, np.ndarray]],
    lang_code: str = "auto"
) -> Dict[str, Any]:
    """
    Transcribes audio (file path or numpy array) to text in proper native Indic script.

    Args:
        audio_input: Audio file path or (sample_rate, numpy_array).
        lang_code: Language code ('auto' for auto-detection, or 'hi', 'ta', 'te', etc.)

    Returns:
        Dict with 'text', 'language', and 'probability'.
    """
    model = get_model()

    # Convert audio input if passed from Gradio / numpy
    if isinstance(audio_input, tuple):
        sr, arr = audio_input
        if np.issubdtype(arr.dtype, np.integer):
            arr = arr.astype(np.float32) / float(np.iinfo(arr.dtype).max)
        elif arr.dtype != np.float32:
            arr = arr.astype(np.float32)
        if arr.ndim > 1:
            arr = np.mean(arr, axis=-1)
        audio_source = arr
    else:
        audio_source = audio_input

    target_lang = None if (not lang_code or lang_code.lower() == "auto") else lang_code.lower()
    prompt = NATIVE_PROMPTS.get(target_lang) if target_lang else None

    segments, info = model.transcribe(
        audio_source,
        language=target_lang,
        initial_prompt=prompt,
        task="transcribe",
        beam_size=5
    )

    text = " ".join([seg.text.strip() for seg in segments]).strip()

    detected_lang = info.language
    prob = info.language_probability

    return {
        "text": text,
        "language": detected_lang,
        "probability": prob
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python indic_transcribe.py <audio_file> [language_code]")
        sys.exit(1)

    file_path = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "auto"
    res = transcribe(file_path, lang)
    print(f"Detected: {res['language']} ({res['probability']*100:.1f}%)")
    print("Transcript:", res["text"])
