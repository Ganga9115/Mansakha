# Mansakha AI Architecture: Frontend Feature Mapping & Integration Changelog

## 1. Executive Summary

This document provides an exhaustive technical reference and system architecture map of all Artificial Intelligence (AI), Machine Learning (ML), 3D Computer Graphics, and Speech Processing features across the **Mansakha Mobile App** (`frontend/`) and the **Administrative & Counsellor Web Portal** (`web-frontend/`), along with signal pipelines, mathematical formulations, conversational boundaries, and a complete changelog of all files created and modified.

The system is designed with **100% local, Sovereign AI execution** (zero external cloud API dependencies, zero recurring Gemini/OpenAI cloud costs, complete data privacy under India's Digital Personal Data Protection Act):

1. **Django AI Inference Backend (`AI-backend/`)**: PyTorch, HuggingFace Transformers, faster-whisper, and scikit-learn models running on port `8000`.
2. **Local Ollama LLM Instance**: Quantized `gemma3:4b` running on port `11434` for empathetic conversational therapy, clinical reasoning, case notes, and adaptive check-ins.
3. **Node.js Gateway Backend (`backend/`)**: Express.js orchestrator on port `4000` coordinating between Supabase PostgreSQL, Django AI, Ollama, and client applications.
4. **Three.js 3D WebGL Avatar Engine**: Client-side hardware-accelerated 3D avatar rendering with bone-level emotional kinetics, real-time viseme lip-sync, and holographic particle shaders.

---

## 2. Core AI Models, Graphics Engines & Algorithms Catalog

| Model / Engine Identifier | Architecture / Framework | Location in Workspace | Purpose & Capabilities |
| :--- | :--- | :--- | :--- |
| **`casual_male.glb`** | ReadyPlayerMe 3D GLB Model | `frontend/public/models/casual_male.glb` | Production male AI counsellor model (brown hair, trimmed beard, blue collared polo shirt; exact match for `avatar_male_counsellor.png`). |
| **`readyplayer.glb`** | ReadyPlayerMe 3D GLB Model | `frontend/public/models/readyplayer.glb` | Production female AI counsellor model. |
| **`Avatar3DController.js`** | Three.js WebGL Engine | `frontend/src/user/chat/components/Avatar3DController.js` | 3D avatar controller managing skeletal bone kinematics (head tilt, nodding, eye gaze), procedural breathing, natural blinking, and real-time lip-sync. |
| **Holographic 3D Particle Canvas** | HTML5 2D Canvas + 3D Projection Math | `frontend/src/user/chat/components/MansakhaCallModal.js` | Symmetrical 1:1 gyroscope hologram with 160 depth-sorted particles, 3 multi-axis planetary rings, ambient radial aura, and 28-bar audio frequency equalizer for Voice Call mode. |
| **`pitch_emotion_model_v2.pkl`** | `VotingClassifier` Ensemble (Random Forest, SVM, Gradient Boosting on acoustic prosody) | `Mansakha-Ai/pitch_emotion_model_v2.pkl` | Analyzes vocal pitch ($F_0$), jitter, shimmer, spectral centroid, and RMS energy via `librosa` to compute continuous **Voice Stress Score** ($0.0 - 1.0$). |
| **`PS094_Sentiment_Model`** | Fine-Tuned Transformer (RoBERTa/BERT architecture) | `Mansakha-Ai/PS094_Sentiment_Model/` | Classifies victim narrative text into positive, neutral, and negative trauma sentiment; outputs raw sentiment score ($-1.0$ to $+1.0$). |
| **`MultilingualEmotion`** | XLM-RoBERTa (11 Emotion Classes) | `Mansakha-Ai/MultilingualEmotion/` | Evaluates multilingual text for fear, sadness, anger, joy, optimism, etc. Weights negative trauma emotions into an **Emotion Distress Score** ($0.0 - 1.0$). |
| **`faster-whisper`** | CTranslate2-accelerated Whisper (`base` / `small`) | Loaded inside `AI-backend/api/ai_services.py` | Transcribes spoken audio into text with high accuracy and low CPU latency for subsequent NLP sentiment and emotion analysis. |
| **IIT Madras Speech Lab ASR API** | IITM SpeechLab v2 Decode Engine | `AI-backend/api/ai_services.py` & `useSpeechToText.js` | Primary Indian-accented Automatic Speech Recognition pipeline with local IndicWhisper fallback. |
| **Local Ollama `gemma3:4b`** | 4-Billion Parameter Quantized LLM | Local daemon (`http://127.0.0.1:11434`) | Generates empathetic companion chat turns, dynamic check-in questions, clinical rationales, and objective case note summaries. |
| **Dynamic Distress Scoring Engine** | Multimodal Fusion Matrix | `backend/src/ai/scoring.js` | Fuses sentiment, voice stress, emotion, and behavioral engagement delta into the unified **Dynamic Distress Score (0–100)**. |
| **Predictive Risk & Escalation Modeler** | Ordinary Least Squares (OLS) Linear Regression | `backend/src/ai/scoring.js` (`predictEscalationRiskBatch`) | Analyzes chronological distress trends to calculate distress velocity ($\text{pts/day}$) and projected days until crossing into High or Critical risk tiers. |

---

## 3. Frontend Feature-to-AI Model Mapping

### A. Mobile Victim App (`frontend/`)

| Screen / Component File | Feature & User Interaction | Underlying AI Model / Engine | Input Signals $\rightarrow$ Output Signals | Clinical & Operational Role |
| :--- | :--- | :--- | :--- | :--- |
| **[ChatScreen.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/chat/screens/ChatScreen.js)** | **24/7 Empathetic Chat Companion**<br>Conversational companion for emotional grounding | **Ollama `gemma3:4b`**<br>(Trauma-informed system prompt) | User text message $\rightarrow$ Grounded, comforting reply (2–3 sentences max) | Immediate emotional support; validates feelings without diagnostic labeling. |
| **[MansakhaCallModal.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/chat/components/MansakhaCallModal.js)** | **WhatsApp-Style Fullscreen Live Call (Voice & Video)**<br>Full-screen WhatsApp overlay with dual voice/video modes | **3D Canvas Hologram** (Voice) / **Three.js 3D Avatar** (Video) + **Ollama `gemma3:4b`** | Speech synthesis & recognition + Camera stream $\rightarrow$ Real-time interactive 3D dialogue | Seamless live voice/video companion call with WhatsApp-grade privacy and clarity. |
| **[Avatar3DController.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/chat/components/Avatar3DController.js)** | **Emotional 3D Avatar Kinematics & Lip Sync**<br>Human facial expressions, nodding, head tilts & visemes | **WebGL Three.js** + **GLTF Morph Targets** + **Speech Boundary Tracking** | TTS syllable boundaries & user emotional keywords $\rightarrow$ Real-time visemes, 5° empathic head tilt, nods, smiles | Provides comforting non-verbal human presence and active listening gestures. |
| **[AiChatButton.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/shared/components/AiChatButton.js)** | **Context-Aware Floating AI Button**<br>Universal FAB across app, hidden inside chat | **React Navigation Active Route Detection** | Navigation route state $\rightarrow$ Dynamically hidden on `/MainTabs/Chatbot`, visible elsewhere | Guarantees instant 1-tap access to Mansakha across app while eliminating clutter inside chat. |
| **[ChatScreen.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/chat/screens/ChatScreen.js)** | **Voice Note Multimodal Input**<br>Audio recording sent with Whisper STT & stress | **faster-whisper** + **pitch_emotion_model_v2** + **PS094 Sentiment** | Audio voice note $\rightarrow$ STT transcript + acoustic voice stress score + distress screening | Transcribes victim voice with Whisper and computes vocal tension stress ($0..1$) via Django AI. |
| **[CheckinScreen.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/wellness/screens/CheckinScreen.js)** | **Adaptive Check-In Questionnaire**<br>Contextual follow-up check-in questions | **Ollama `gemma3:4b`** (`generateInteractiveQuestion`) | User past history context $\rightarrow$ Dynamic multiple-choice questions & gentle options | Prevents questionnaire fatigue by personalizing questions based on past session context. |
| **[CheckinScreen.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/wellness/screens/CheckinScreen.js)** | **Multimodal Check-In Scoring**<br>Post-checkin holistic distress evaluation | **Phase 2 Multimodal Fusion Matrix** (Sentiment + Voice Stress + Emotion + Engagement) | Check-in transcript & voice $\rightarrow$ **Dynamic Distress Score (0–100)** + Risk Level | Accurately classifies victim risk (Low, Moderate, High, Critical) with multimodal validation. |
| **[HomeScreen.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/wellness/screens/HomeScreen.js)** | **Distress Hero Card & Risk Badge**<br>Real-time mental wellness status & alerts | **Dynamic Distress Scoring Engine** (`backend/src/ai/scoring.js`) | Latest check-in reading $\rightarrow$ Score badge (`score/100`), status tier, proactive check-in nudges | Transparent mental wellness status for the victim; nudges proactive help when score drops. |
| **[DistressHistoryScreen.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/wellness/screens/DistressHistoryScreen.js)** | **Distress Trend 14-Day Bar Chart**<br>Longitudinal visual recovery timeline | **Temporal Score Tracking** (`distress_scores` timeseries) | Historical distress readings $\rightarrow$ Color-coded chronological trend bars | Empowers victims to visualize recovery trajectory and identify high-stress triggers. |
| **[JournalScreen.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/wellness/screens/JournalScreen.js)** | **Voice-to-Text Reflective Journaling**<br>Speech input & baseline tracking | **Web Speech API / faster-whisper** + **Engagement Baseline Tracker** | Spoken voice journal $\rightarrow$ Real-time text transcription + response length baseline | Therapeutic private journaling with unobtrusive baseline tracking for early disengagement. |
| **[ThreatReportScreen.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/wellness/screens/ThreatReportScreen.js)** & **[RequestInterventionScreen.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/wellness/screens/RequestInterventionScreen.js)** | **Statutory Intervention Triage**<br>Protection, Medical, Relocation, Legal Aid | **Ollama `gemma3:4b`** & **Rule Classifier** (`resolveInterventionTypeId`) | Free-text threat description $\rightarrow$ Recommended statutory intervention category | Immediately routes urgent protection or relocation requests to Protection Officers. |

---

### B. Counsellor & Administrative Web Portal (`web-frontend/`)

| Portal / Page File | Feature & Administrative UI | Underlying AI Model / Engine | Input Signals $\rightarrow$ Output Signals | Administrative & Legal Role |
| :--- | :--- | :--- | :--- | :--- |
| **[CaseDetail.jsx](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/web-frontend/src/counsellor/pages/CaseDetail.jsx)** | **Explainable AI Multi-Signal Breakdown**<br>Transparent sub-score cards | **Multimodal Disaggregation** (4 individual feature channels) | Audio + NLP inputs $\rightarrow$ 4 sub-scores: Sentiment, Voice Stress, Emotion, Engagement Delta | Provides clinical explainability so counsellors see exactly why a case was flagged. |
| **[CaseDetail.jsx](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/web-frontend/src/counsellor/pages/CaseDetail.jsx)** | **Explainable Clinical Rationale**<br>Context box explaining distress drivers | **Ollama `gemma3:4b`** (Clinical reasoning prompt) | Conversation transcript $\rightarrow$ Sentence highlighting specific trauma cues/words | Pinpoints specific grievance topics (e.g. intimidation by accused) for the counsellor. |
| **[CaseDetail.jsx](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/web-frontend/src/counsellor/pages/CaseDetail.jsx)** | **Predictive Risk & Escalation Warning**<br>Forward-looking trajectory warning | **OLS Linear Trend Regression** (`predictEscalationRisk`) | Historical score readings $\rightarrow$ Velocity ($\text{pts/day}$) & ETA (e.g. *"Critical in ~5.4d"*) | Enables proactive scheduling of sessions before acute psychological crisis occurs. |
| **[CaseNotes.jsx](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/web-frontend/src/counsellor/pages/CaseNotes.jsx)** | **AI-Drafted Clinical Case Notes**<br>Feed entries tagged `[AI-drafted]` | **Ollama `gemma3:4b`** (`generateCaseNoteDraft`) | Check-in transcript $\rightarrow$ 2–4 sentence objective, factual clinical summary | Eliminates repetitive documentation overhead for counsellors while ensuring rigorous case notes. |
| **[AlertsFeed.jsx](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/web-frontend/src/counsellor/pages/AlertsFeed.jsx)** & **[AdminAlerts.jsx](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/web-frontend/src/district_admin/pages/AdminAlerts.jsx)** | **Distress Spike & SOS Alert Feed**<br>Urgent triage queue for crisis response | **Dynamic Distress Threshold Engine** ($\Delta \ge 20$ pts or Score $\ge 80$) | Distress score shift $\rightarrow$ High-priority operational alert dispatched to counsellor/IO | Guarantees that acute trauma or sudden threats trigger rapid, auditable interventions. |
| **[AdminDashboard.jsx](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/web-frontend/src/district_admin/pages/AdminDashboard.jsx)** | **Predicted Escalations Metric Card**<br>Jurisdiction-wide early warning counter | **Batch Predictive Regression** (`predictEscalationRiskBatch`) | All district victim score streams $\rightarrow$ Total cases projected to escalate within 14d | Shifts administrative posture from reactive policing to proactive early intervention. |
| **[Analysis.jsx](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/web-frontend/src/state_admin/pages/Analysis.jsx)** & **[Analysis.jsx](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/web-frontend/src/national_admin/pages/Analysis.jsx)** | **Jurisdiction Intelligence & Demand Surge**<br>Qualitative themes & workload forecast | **Ollama `gemma3:4b`** (`generateJurisdictionAnalytics`) | Aggregated incident narratives $\rightarrow$ Emerging risk themes + Counsellor demand surge | Guides allocation of counsellors, legal representatives, and protection squads. |

---

## 4. 3D Avatar & Visual Graphics Subsystem Deep Dive

### A. Avatar Skeletal Architecture & Bone Control
The 3D Avatar Controller ([Avatar3DController.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/chat/components/Avatar3DController.js)) controls bone transformations and morph targets:
- **Captured Bones**:
  - `Head` / `mixamorigHead`: Rotated along X (pitch/nodding), Y (yaw/glance), and Z (roll/empathic tilt).
  - `Neck` / `mixamorigNeck`: Micro-sway for physiological breathing (0.28Hz).
  - `LeftEye` & `RightEye`: Saccadic eye micro-movements for lifelike cognitive presence.
- **Dynamic Camera Positioning**:
  - Distance set to `0.78m` with target centered at `(0, 1.62, 0)` with FOV 34°.
  - Produces standard portrait/passport framing (head, neck, collar, and chest in clear view without intrusive zoom).

### B. Procedural Emotional Kinetics Engine
The avatar transitions smoothly across four primary emotional states based on user speech keywords:

| Emotion State | Target Triggers | Kinematic Motion & Bone Poses | Morph Targets Activated |
| :--- | :--- | :--- | :--- |
| **Empathy (`empathy`)** | *"overwhelmed"*, *"anxious"*, *"scared"*, *"hurt"*, *"pain"*, *"threat"*, *"crying"* | 5° Head Tilt ($Z = +0.055\text{ rad}$), slow affirmative nodding at $0.4\text{ Hz}$ | `browInnerUp: 0.35`, `eyeSquint: 0.15` |
| **Reassuring (`reassuring`)** | AI calming speech, *"better"*, *"relief"*, *"thank you"*, *"okay"* | Direct forward gaze with gentle speech emphasis nod | `mouthSmile: 0.38`, `eyeWide: 0.08` |
| **Thinking (`thinking`)** | During Ollama inference / speech processing turn | 8° Cognitive glance to side ($Y = +0.085\text{ rad}$), slight upward tilt | `browOuterUp: 0.20`, `mouthPucker: 0.10` |
| **Listening (`listening`)** | Default idle state while user is speaking | Attentive forward posture with natural breathing sway | Neutral expressions with random natural blinks |

### C. Real-Time Lip-Sync Synthesis
- **Speech Boundary Driven**: Bound to Web Speech API `utterance.onboundary = 'word'`.
- **Viseme Morph Mapping**: Dynamically modulates ReadyPlayerMe viseme morph targets:
  $$\text{effectiveJaw} = \min(0.92, \text{jawOpen} \times 1.25)$$
  Targets `viseme_aa`, `mouthOpen`, `viseme_O`, `viseme_U` with natural phonetic syllabic open/close decay cycles.

### D. Voice Call Holographic Particle Gyroscope
In Voice Call mode (`!isVideoMode`), [MansakhaCallModal.js](file:///c:/Users/krish/Documents/RMK%20Engineering%20College/SIH-2026/Mansakha/frontend/src/user/chat/components/MansakhaCallModal.js) renders a 3D hologram:
- **Aspect Ratio Locking**: Styled with `aspectRatio: 1`, rendered with high-DPI canvas buffer (`canvas.width = cssSize * dpr`, `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`) to eliminate oval squishing.
- **3D Particles**: 160 depth-sorted points rotated along 3 axes ($X, Y$) using 3D perspective projection ($\text{scale} = \frac{250}{250 + z_2}$) and glow shadows.
- **Orbital Gyroscope Rings**: 3 planetary rings rotating at contrasting angular velocities with elliptical 3D tilt.
- **Soundwave Visualizer**: 28-bar animated audio frequency equalizer oscillating with speaking and breathing frequencies.

---

## 5. Multimodal Distress Scoring & Threshold Mathematics

### Multi-Signal Fusion Formulas

#### Case A: Multimodal Input (Voice + Text Provided) — Phase 2 Weights
When the victim records audio, acoustic vocal stress is extracted:

$$
\text{Score} = \left( 0.40 \cdot \text{Sentiment}_{\text{raw}} + 0.30 \cdot \text{VoiceStress} + 0.20 \cdot \text{Emotion} + 0.10 \cdot \text{EngagementDrop} \right) \times 100
$$

#### Case B: Text-Only Input (No Audio) — Phase 1 Weights
When no audio is attached:

$$
\text{Score} = \left( 0.50 \cdot \text{Sentiment}_{\text{raw}} + 0.35 \cdot \text{Emotion} + 0.15 \cdot \text{EngagementDrop} \right) \times 100
$$

### Risk Tiers & Clinical Response Matrix

| Distress Score ($0-100$) | Risk Classification | System Behavior | Statutory Protocol |
| :---: | :---: | :--- | :--- |
| **$0 - 29$** | **Low** | Normal dashboard display, self-guided journaling and wellness tips. | Standard bi-weekly follow-up. |
| **$30 - 59$** | **Moderate** | Nudge periodic check-ins, suggest wellness exercises, notify counsellor. | Routine counsellor review. |
| **$60 - 79$** | **High** | High-risk alert created for assigned Counsellor; 14566 helpline appended. | Mandatory counselling session scheduling within 48h. |
| **$80 - 100$** | **Critical (SOS)** | Immediate urgent alert dispatched to Counsellor and District Admin; SOS modal triggered. | Emergency intervention: Protection Officer & DLSA legal aid alerted. |

---

## 6. AI Conversational & Clinical Guardrails (Boundaries)

### 1. Clinical & Medical Boundaries
- **No Clinical Diagnoses**: Mansakha is an emotional companion, not a licensed physician or psychiatrist. It never diagnoses disorders (e.g. PTSD, BPD) or prescribes medication.
- **Supportive Bridge**: Flagged distress cases are routed directly to assigned human counsellors.

### 2. Legal & Statutory Boundaries
- **No Cross-Examination**: Victims of caste atrocities often face traumatic institutional friction. Mansakha **never** interrogates, demands evidence, asks for proof, or challenges incident timelines.
- **No Authoritative Legal Advice**: Does not guarantee case outcomes or replace official DLSA legal representatives.

### 3. Conversational Persona Boundaries
- **Break the Interrogation Trap**: Never ends every message with a question; validates feelings and sits in silence/calm reflection.
- **Eliminate Clichés & Toxic Positivity**: Forbids hollow scripts like *"I hear you..."* or fake optimism.
- **Strict Turn Conciseness**: 1–2 short spoken sentences in live calls; 2–3 sentences in text chat.
- **Language Uniformity**: Answers strictly in the victim's language (English, Hindi, Tamil, Telugu, etc.).

### 4. Safety & Emergency Escalation Protocol
- **National Atrocity Helpline (14566)**: Appended automatically when severe distress is expressed.
- **Separation of Emergency SOS**: Urgent police dispatch remains the sole responsibility of the **Red Emergency Call Button** (`GetHelpButton`), keeping Mansakha focused purely on therapeutic presence.

---

## 7. Changelog: Files Created, Modified, and Maintained

### A. New Components & Modules (`NEW`)

1. **`frontend/src/user/chat/components/MansakhaCallModal.js`**
   - Fullscreen WhatsApp-styled voice & video call modal with 1:1 circular 3D hologram particle sphere, 28-bar equalizer soundbars, and full-screen 3D avatar integration.
2. **`frontend/src/user/chat/components/Avatar3DController.js`**
   - Three.js WebGL controller supporting GLTF models, bone kinematics, affective emotional poses, and lip-sync.
3. **`frontend/public/models/casual_male.glb`**
   - Official 3D male avatar model with modern brown hair, trimmed beard, and blue polo shirt.
4. **`frontend/assets/avatar_male_counsellor.png`**
   - Canonical 2D reference artwork for the male counsellor.
5. **`backend/src/ai/djangoAiClient.js`**
   - REST bridge connecting Node.js Express to Django AI (`http://127.0.0.1:8000`).
6. **`Mansakha/AI-backend/`**
   - Independent Django REST API environment hosting faster-whisper, PyTorch, and scikit-learn models.

---

### B. Modified Files (`MODIFIED`)

1. **`frontend/src/user/shared/components/AiChatButton.js`**
   - Updated route detection to hide FAB strictly on `/MainTabs/Chatbot` while maintaining universal visibility on `Home` and other screens.
2. **`frontend/src/user/chat/screens/ChatScreen.js`**
   - Integrated `MansakhaCallModal`, voice note recording with Whisper STT & voice stress analysis, and turn logging.
3. **`backend/src/ai/ai.js`**
   - Integrated `analyzeMultimodalViaDjango` and enabled Phase 2 multimodal scoring.
4. **`backend/src/ai/scoring.js`**
   - Implemented dynamic weights and regression trend forecasting.
5. **`backend/src/ai/ollama.js`**
   - Complete migration from cloud Gemini API to local `gemma3:4b`.
6. **`backend/src/ai/gemini.js`**
   - Seamless rerouting of all legacy cloud calls to local Ollama.
7. **`backend/src/user/routes/user.routes.js`**
   - Multi-signal check-in processing and distress score logging.

---

### C. Untouched & Preserved Components (`PRESERVED`)

1. **`frontend/src/user/shared/components/GetHelpButton.js` & `TopRightActions.js`**
   - Dedicated red emergency call button in header preserved exclusively for police emergency dispatch (PCR 100) and urgent alerts.
