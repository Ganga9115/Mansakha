from django.urls import path
from .views import (
    HealthCheckView,
    AnalyzeTextView,
    AnalyzeVoiceView,
    TranscribeView,
    MultimodalAnalysisView,
    ChatView,
    PredictRiskView,
)

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='ai-health'),
    path('sentiment/', AnalyzeTextView.as_view(), name='ai-sentiment'),
    path('emotion/', AnalyzeTextView.as_view(), name='ai-emotion'),
    path('analyze-text/', AnalyzeTextView.as_view(), name='ai-analyze-text'),
    path('voice-stress/', AnalyzeVoiceView.as_view(), name='ai-voice-stress'),
    path('analyze-voice/', AnalyzeVoiceView.as_view(), name='ai-analyze-voice'),
    path('transcribe/', TranscribeView.as_view(), name='ai-transcribe'),
    path('multimodal/', MultimodalAnalysisView.as_view(), name='ai-multimodal'),
    path('chat/', ChatView.as_view(), name='ai-chat'),
    path('predict-risk/', PredictRiskView.as_view(), name='ai-predict-risk'),
]
