import os
import tempfile
import base64
import json
import logging
from typing import List, Dict, Any

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

import requests

from .ai_services import (
    analyze_sentiment,
    analyze_emotion,
    analyze_voice_stress,
    transcribe_audio,
    analyze_multimodal,
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    VOICE_PITCH_DIR,
    SENTIMENT_MODEL_DIR,
    EMOTION_MODEL_DIR,
)

logger = logging.getLogger(__name__)


class HealthCheckView(APIView):
    """
    GET /api/ai/health/
    Returns the operability status of local AI models and Ollama.
    """
    def get(self, request):
        ollama_online = False
        try:
            r = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2)
            ollama_online = r.ok
        except Exception:
            ollama_online = False

        status_payload = {
            "status": "healthy",
            "models": {
                "voice_stress_ensemble": (VOICE_PITCH_DIR / "pitch_emotion_model_v2.pkl").exists(),
                "sentiment_transformer": SENTIMENT_MODEL_DIR.exists(),
                "multilingual_emotion_transformer": EMOTION_MODEL_DIR.exists(),
                "faster_whisper_stt": True,
                "ollama_gemma3": ollama_online,
            },
            "ollama_url": OLLAMA_BASE_URL,
            "ollama_model": OLLAMA_MODEL,
        }
        return Response(status_payload)


class AnalyzeTextView(APIView):
    """
    POST /api/ai/analyze-text/
    Body: { "text": "I am terrified and scared for my family." }
    """
    def post(self, request):
        text = request.data.get("text", "")
        if not text or not text.strip():
            return Response({"error": "text field is required"}, status=status.HTTP_400_BAD_REQUEST)

        sentiment = analyze_sentiment(text)
        emotion = analyze_emotion(text)

        return Response({
            "text": text,
            "sentiment_raw": sentiment.get("sentiment_raw", 0.0),
            "sentiment": sentiment,
            "emotion_score": emotion.get("emotion_score", 0.2),
            "emotion": emotion,
        })


class AnalyzeVoiceView(APIView):
    """
    POST /api/ai/analyze-voice/
    Accepts multipart file 'audio' or JSON with 'audio_base64'.
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        temp_file_path = None
        try:
            if "audio" in request.FILES:
                audio_file = request.FILES["audio"]
                suffix = os.path.splitext(audio_file.name)[1] or ".wav"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    for chunk in audio_file.chunks():
                        tmp.write(chunk)
                    temp_file_path = tmp.name

            elif "audio_base64" in request.data:
                b64 = request.data["audio_base64"]
                if "," in b64:
                    b64 = b64.split(",", 1)[1]
                audio_bytes = base64.b64decode(b64)
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    tmp.write(audio_bytes)
                    temp_file_path = tmp.name
            else:
                return Response(
                    {"error": "Either 'audio' file upload or 'audio_base64' string is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            voice_result = analyze_voice_stress(temp_file_path)
            return Response(voice_result)

        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception:
                    pass


class TranscribeView(APIView):
    """
    POST /api/ai/transcribe/
    Accepts multipart file 'audio' or 'audio_base64', optional 'language'.
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        temp_file_path = None
        try:
            lang = request.data.get("language", "auto")

            if "audio" in request.FILES:
                audio_file = request.FILES["audio"]
                suffix = os.path.splitext(audio_file.name)[1] or ".wav"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    for chunk in audio_file.chunks():
                        tmp.write(chunk)
                    temp_file_path = tmp.name

            elif "audio_base64" in request.data:
                b64 = request.data["audio_base64"]
                if "," in b64:
                    b64 = b64.split(",", 1)[1]
                audio_bytes = base64.b64decode(b64)
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    tmp.write(audio_bytes)
                    temp_file_path = tmp.name
            else:
                return Response(
                    {"error": "Either 'audio' file or 'audio_base64' is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            result = transcribe_audio(temp_file_path, language=lang)
            return Response(result)

        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception:
                    pass


class MultimodalAnalysisView(APIView):
    """
    POST /api/ai/multimodal/
    Unified pipeline:
    - Text AND/OR Audio
    - Transcribes, extracts Voice Stress (0..1), Sentiment (-1..+1), Emotion (0..1)
    - Queries Ollama for explainable clinical rationale and intervention recommendation
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        temp_file_path = None
        try:
            text = request.data.get("text", "")

            if "audio" in request.FILES:
                audio_file = request.FILES["audio"]
                suffix = os.path.splitext(audio_file.name)[1] or ".wav"
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                    for chunk in audio_file.chunks():
                        tmp.write(chunk)
                    temp_file_path = tmp.name

            elif "audio_base64" in request.data and request.data["audio_base64"]:
                b64 = request.data["audio_base64"]
                if "," in b64:
                    b64 = b64.split(",", 1)[1]
                audio_bytes = base64.b64decode(b64)
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    tmp.write(audio_bytes)
                    temp_file_path = tmp.name

            if not text and not temp_file_path:
                return Response(
                    {"error": "Please provide 'text' or an 'audio' file"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            analysis = analyze_multimodal(text=text, audio_path=temp_file_path)
            return Response(analysis)

        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                except Exception:
                    pass


class ChatView(APIView):
    """
    POST /api/ai/chat/
    Conversational AI companion for victims, backed by Ollama Gemma 3-4B.
    Performs simultaneous clinical distress assessment + empathic conversational reply.
    """
    def post(self, request):
        message = request.data.get("message", "")
        if not message or not message.strip():
            return Response({"error": "message is required"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Local specialized model screening
        sentiment = analyze_sentiment(message)
        emotion = analyze_emotion(message)

        # 2. Empathic response generation via Ollama
        prompt = f"""You are "Mansakha", a trauma-informed, deeply respectful, and calm companion for victims of atrocities under India's SC/ST (Prevention of Atrocities) Act.
The user said:
\"\"\"{message}\"\"\"

Write a short, warm, supportive, and validating reply (2 to 3 sentences max).
Never interrogate. Never give medical, legal, or police instructions.
If they express intense distress, remind them gently that they are not alone and that help is available.

Reply directly with just your compassionate message:"""

        reply_text = "I hear you, and I want you to know that your safety and well-being matter. Take your time, and remember that our counsellors are here for you whenever you need support."
        try:
            res = requests.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
                timeout=12,
            )
            if res.ok:
                rep = res.json().get("response", "").strip()
                if rep:
                    reply_text = rep
        except Exception as e:
            logger.warning(f"Ollama chat offline ({e}), using default compassionate response.")

        return Response({
            "reply": reply_text,
            "sentiment_raw": sentiment.get("sentiment_raw", 0.0),
            "emotion_score": emotion.get("emotion_score", 0.2),
            "dominant_emotion": emotion.get("dominant_emotion", "neutral"),
            "sentiment": sentiment,
            "emotion": emotion,
        })


class PredictRiskView(APIView):
    """
    POST /api/ai/predict-risk/
    Performs longitudinal trend analysis (least-squares linear regression) over
    historical distress scores to predict escalation before a crisis emerges.
    Body: { "history": [ { "score": 35, "computedAt": "2026-09-01T..." }, ... ] }
    """
    def post(self, request):
        history = request.data.get("history", [])
        if len(history) < 3:
            return Response({
                "predictedTrend": "insufficient_data",
                "projectedScoreIn7Days": None,
                "daysToNextTier": None,
                "nextTier": None,
                "reason": "Minimum 3 historical check-in data points required for predictive regression.",
            })

        from datetime import datetime

        def parse_ts(val):
            if isinstance(val, (int, float)):
                return float(val)
            s = str(val).replace('Z', '+00:00')
            try:
                return datetime.fromisoformat(s).timestamp()
            except Exception:
                return 0.0

        sorted_history = sorted(history, key=lambda x: parse_ts(x.get("computedAt", 0)))
        recent = sorted_history[-8:]
        t0 = parse_ts(recent[0].get("computedAt", 0))

        xs = [(parse_ts(p.get("computedAt", 0)) - t0) / 86400.0 for p in recent]
        ys = [float(p.get("score", 0)) for p in recent]

        n = len(xs)
        sum_x = sum(xs)
        sum_y = sum(ys)
        sum_xy = sum(x * y for x, y in zip(xs, ys))
        sum_xx = sum(x * x for x in xs)
        denom = n * sum_xx - sum_x * sum_x

        if denom == 0:
            return Response({"predictedTrend": "flat", "projectedScoreIn7Days": round(ys[-1])})

        slope = (n * sum_xy - sum_x * sum_y) / denom
        intercept = (sum_y - slope * sum_x) / n

        last_x = xs[-1]
        last_y = ys[-1]

        trend = "rising" if slope > 0.5 else "falling" if slope < -0.5 else "flat"
        projected_7d = max(0, min(100, round(intercept + slope * (last_x + 7))))

        days_to_next_tier = None
        next_tier = None
        thresholds = [30, 55, 80]
        if slope > 0.5:
            for t in thresholds:
                if t > last_y:
                    days = (t - last_y) / slope
                    if 0 < days <= 14:
                        days_to_next_tier = round(days, 1)
                        next_tier = "Moderate" if t == 30 else "High" if t == 55 else "Critical"
                    break

        return Response({
            "predictedTrend": trend,
            "slopePointsPerDay": round(slope, 3),
            "currentScore": round(last_y),
            "projectedScoreIn7Days": projected_7d,
            "daysToNextTier": days_to_next_tier,
            "nextTier": next_tier,
            "explainableExplanation": (
                f"Distress is rising at {slope:.1f} points/day. "
                f"Projected to cross into {next_tier} risk within {days_to_next_tier} days without intervention."
                if next_tier
                else "Distress trend is currently stable or within manageable threshold limits."
            ),
        })
