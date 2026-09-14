# Mansakha Local AI Backend

Fast, local, and sovereign AI backend providing acoustic voice stress analysis, multilingual speech-to-text (IIT Madras Speech Lab + faster-whisper), and Ollama-based clinical companion services for the Mansakha trauma support platform.

---

## 🚀 Quick Setup for Teammates

### 1. Create and Activate Virtual Environment
```bash
cd Mansakha/AI-backend
python -m venv venv

# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Windows (CMD):
.\venv\Scripts\activate.bat
# Linux/macOS:
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Initialize Database & Run Server
```bash
python manage.py migrate
python manage.py runserver 8000
```

The AI backend will be accessible at `http://127.0.0.1:8000/`.

---

## 📡 REST API Endpoints

* `GET /api/ai/health/` — Health check & model status.
* `POST /api/ai/analyze-voice/` — Vocal pitch, jitter, and continuous Voice Stress Score (0.0–1.0).
* `POST /api/ai/analyze-text/` — NLP sentiment, trauma emotion breakdown, and distress scoring.
* `POST /api/ai/analyze-multimodal/` — Multimodal fusion scoring (Voice note audio + transcript).
* `POST /api/ai/chat/` — Conversational turns with local Ollama companion (`gemma3:4b`).
* `POST /api/ai/predict-risk/` — Temporal distress velocity & escalation trajectory forecasting.
