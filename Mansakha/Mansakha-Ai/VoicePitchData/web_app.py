import asyncio, pickle, warnings, json, struct
import numpy as np
from pathlib import Path
from scipy.signal import resample_poly
from math import gcd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
import librosa
import sys, os

warnings.filterwarnings('ignore')
sys.path.insert(0, str(Path(__file__).parent))

# ── Load model (v2 preferred, fall back to v1) ────────────────────────────────
def load_model():
    v2_model = Path('pitch_emotion_model_v2.pkl')
    v1_model = Path('pitch_emotion_model.pkl')
    if v2_model.exists():
        model   = pickle.load(open('pitch_emotion_model_v2.pkl', 'rb'))
        scaler  = pickle.load(open('pitch_scaler_v2.pkl', 'rb'))
        le      = pickle.load(open('pitch_label_encoder_v2.pkl', 'rb'))
        version = 'v2'
    elif v1_model.exists():
        model   = pickle.load(open('pitch_emotion_model.pkl', 'rb'))
        scaler  = pickle.load(open('pitch_scaler.pkl', 'rb'))
        le      = pickle.load(open('pitch_label_encoder.pkl', 'rb'))
        version = 'v1'
    else:
        raise FileNotFoundError('No model found. Run train_pitch_classifier.py first.')
    print(f'Loaded {version} model. Classes: {list(le.classes_)}')
    return model, scaler, le, version

V2_EXTRA = ['rms_mean','rms_std','rms_max','rms_range','zcr_mean','zcr_std',
            'f0_p10','f0_p90','high_pitch_ratio','contour_smooth']

from pitch_features import FEATURE_NAMES

model, scaler, le, MODEL_VERSION = load_model()
USE_V2 = MODEL_VERSION == 'v2'
ACTIVE_FEATURES = FEATURE_NAMES + V2_EXTRA if USE_V2 else FEATURE_NAMES
SR_TARGET = 22050

# ── Feature extraction ────────────────────────────────────────────────────────
def extract_features(audio_f32, sr):
    from pitch_features import extract_pitch_features
    # Resample to 22050 if needed
    if sr != SR_TARGET:
        g = gcd(SR_TARGET, sr)
        audio_f32 = resample_poly(audio_f32, SR_TARGET // g, sr // g).astype(np.float32)
    feats = extract_pitch_features(audio_f32, SR_TARGET)
    if feats is None:
        return None
    if USE_V2:
        rms = librosa.feature.rms(y=audio_f32, frame_length=2048, hop_length=512)[0]
        zcr = librosa.feature.zero_crossing_rate(audio_f32, frame_length=2048, hop_length=512)[0]
        fmin_hz = librosa.note_to_hz('C2')
        fmax_hz = librosa.note_to_hz('C7')
        f0 = librosa.yin(audio_f32, fmin=fmin_hz, fmax=fmax_hz,
                         sr=SR_TARGET, frame_length=2048, hop_length=512)
        vm = (f0 > fmin_hz * 1.05) & (f0 < fmax_hz * 0.95)
        vf0 = f0[vm]
        if len(vf0) < 5:
            return None
        smooth = float(np.mean(np.abs(np.diff(np.diff(vf0))))) if len(vf0) > 2 else 0.0
        feats.update({
            'rms_mean': float(np.mean(rms)), 'rms_std': float(np.std(rms)),
            'rms_max':  float(np.max(rms)),  'rms_range': float(np.max(rms)-np.min(rms)),
            'zcr_mean': float(np.mean(zcr)), 'zcr_std': float(np.std(zcr)),
            'f0_p10':   float(np.percentile(vf0,10)), 'f0_p90': float(np.percentile(vf0,90)),
            'high_pitch_ratio': float(np.mean(vf0>200)), 'contour_smooth': smooth,
        })
    x = np.array([feats.get(k, 0.0) for k in ACTIVE_FEATURES]).reshape(1, -1)
    if np.isnan(x).any() or np.isinf(x).any():
        return None
    x_s = scaler.transform(x)
    proba = model.predict_proba(x_s)[0]
    pred  = le.inverse_transform([np.argmax(proba)])[0]
    conf  = {le.classes_[i]: round(float(proba[i]), 4) for i in range(len(le.classes_))}
    # Get pitch contour for display
    fmin_hz = librosa.note_to_hz('C2')
    fmax_hz = librosa.note_to_hz('C7')
    f0d = librosa.yin(audio_f32, fmin=fmin_hz, fmax=fmax_hz,
                      sr=SR_TARGET, frame_length=2048, hop_length=512)
    vm  = (f0d > fmin_hz * 1.05) & (f0d < fmax_hz * 0.95)
    f0_out = [round(float(v), 1) if b else None for v, b in zip(f0d, vm)]
    return {'emotion': pred, 'confidence': conf, 'pitch': f0_out}

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title='Pitch Emotion Detector')

WINDOW_SEC  = 2.0
HOP_SEC     = 0.4

@app.get('/', response_class=HTMLResponse)
async def index():
    html_path = Path(__file__).parent / 'web_ui.html'
    return html_path.read_text(encoding='utf-8')

@app.websocket('/ws')
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    # First message contains sample rate as JSON
    info_raw = await ws.receive_text()
    info     = json.loads(info_raw)
    browser_sr = int(info.get('sampleRate', 44100))
    print(f'WS connected  browser_sr={browser_sr}')

    buffer      = np.array([], dtype=np.float32)
    window_samp = int(WINDOW_SEC * browser_sr)
    last_proc   = asyncio.get_event_loop().time()

    try:
        while True:
            raw = await ws.receive_bytes()
            # raw = little-endian float32 PCM
            chunk = np.frombuffer(raw, dtype=np.float32)
            buffer = np.concatenate([buffer, chunk])
            if len(buffer) > window_samp * 3:
                buffer = buffer[-window_samp * 2:]

            now = asyncio.get_event_loop().time()
            if len(buffer) >= window_samp and (now - last_proc) >= HOP_SEC:
                last_proc = now
                audio_win = buffer[-window_samp:].copy()
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None, extract_features, audio_win, browser_sr
                )
                if result:
                    await ws.send_text(json.dumps(result))
                else:
                    await ws.send_text(json.dumps({'emotion': 'silence', 'confidence': {}, 'pitch': []}))
    except WebSocketDisconnect:
        print('WS disconnected')

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('web_app:app', host='0.0.0.0', port=8765, reload=False)
