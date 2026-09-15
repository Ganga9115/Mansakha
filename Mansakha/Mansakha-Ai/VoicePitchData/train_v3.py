import os, time, pickle, warnings
import numpy as np
import pandas as pd
import librosa
from pathlib import Path
from scipy.stats import skew, kurtosis
from scipy.signal import medfilt
from sklearn.ensemble import (RandomForestClassifier, HistGradientBoostingClassifier,
    ExtraTreesClassifier, StackingClassifier)
from sklearn.neural_network import MLPClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report

warnings.filterwarnings('ignore')

DATASET_DIR = Path('Voice Emotion Dataset')
CACHE_V3    = Path('pitch_features_cache_v3.csv')
MODEL_V3    = Path('pitch_emotion_model_v3.pkl')
SCALER_V3   = Path('pitch_scaler_v3.pkl')
ENCODER_V3  = Path('pitch_label_encoder_v3.pkl')
EMOTIONS    = ['anger', 'disgust', 'fear', 'happy', 'neutral', 'sad']
SR          = 22050

# ── Noise gate: attenuate frames near the noise floor ────────────────────────
def noise_gate(audio, sr, frame_len=1024, hop_len=256, gate_db=12.0):
    rms    = librosa.feature.rms(y=audio, frame_length=frame_len, hop_length=hop_len)[0]
    rms_db = librosa.amplitude_to_db(rms + 1e-9)
    noise_floor = np.percentile(rms_db, 15)
    threshold   = noise_floor + gate_db
    gain_frames = np.where(rms_db >= threshold, 1.0,
                           np.clip((rms_db - noise_floor) / (gate_db + 1e-9), 0.05, 1.0))
    t_frames = np.arange(len(gain_frames)) * hop_len + frame_len // 2
    t_audio  = np.arange(len(audio))
    gain     = np.interp(t_audio, t_frames, gain_frames)
    return audio * gain

# ── Median-filter voiced pitch contour ───────────────────────────────────────
def clean_f0(f0, voiced_mask, kernel=5):
    f0c = f0.copy()
    if voiced_mask.sum() >= kernel:
        f0c[voiced_mask] = medfilt(f0[voiced_mask], kernel_size=kernel)
    return f0c

# ── HNR via autocorrelation ───────────────────────────────────────────────────
def compute_hnr(audio, f0, voiced_mask, sr, hop_length=512):
    vals = []
    for i, (freq, iv) in enumerate(zip(f0, voiced_mask)):
        if not iv or freq <= 0 or np.isnan(freq):
            continue
        T = int(round(sr / freq))
        if T < 2:
            continue
        s, e = i * hop_length, i * hop_length + T * 3
        if e > len(audio):
            continue
        frame = audio[s:e].astype(np.float64) - audio[s:e].mean()
        ac    = np.correlate(frame, frame, mode='full')
        ac    = ac[len(ac) // 2:]
        if len(ac) <= T or ac[0] < 1e-10:
            continue
        r = float(np.clip(ac[T] / (ac[0] + 1e-10), 0, 0.9999))
        vals.append(10.0 * np.log10((r + 1e-10) / (1.0 - r + 1e-10)))
    if len(vals) < 2:
        return 0.0, 0.0
    return float(np.mean(vals)), float(np.std(vals))

# ── Shimmer ────────────────────────────────────────────────────────────────── 
def compute_shimmer(audio, f0, voiced_mask, sr, hop_length=512):
    amps = []
    for i, (freq, iv) in enumerate(zip(f0, voiced_mask)):
        if not iv or freq <= 0 or np.isnan(freq):
            continue
        T = int(round(sr / freq))
        s, e = i * hop_length, i * hop_length + T
        if e > len(audio):
            continue
        amps.append(float(np.sqrt(np.mean(audio[s:e] ** 2) + 1e-10)))
    if len(amps) < 2:
        return 0.0
    a = np.array(amps)
    return float(np.mean(np.abs(np.diff(a)) / (a[:-1] + 1e-10)))

# ── Full v3 feature extractor ─────────────────────────────────────────────────
def extract_v3(audio, sr):
    audio = noise_gate(audio, sr)
    fmin  = librosa.note_to_hz('C2')
    fmax  = librosa.note_to_hz('C7')
    f0    = librosa.yin(audio, fmin=fmin, fmax=fmax, sr=sr,
                        frame_length=2048, hop_length=512)
    vmask = (f0 > fmin * 1.05) & (f0 < fmax * 0.95)
    f0    = clean_f0(f0, vmask, kernel=5)
    vf0   = f0[vmask]
    if len(vf0) < 10:
        return None

    vfrac    = vmask.sum() / max(len(vmask), 1)
    d1       = np.diff(vf0)
    d2       = np.diff(d1) if len(d1) > 1 else np.array([0.0])
    mf0      = float(np.mean(vf0))
    jitter   = float(np.mean(np.abs(d1)) / (mf0 + 1e-9)) if len(d1) else 0.0
    slope    = float(np.polyfit(np.arange(len(vf0)), vf0, 1)[0]) if len(vf0) > 1 else 0.0
    hv, _    = np.histogram(vf0, bins=20, density=True)
    hv       = hv[hv > 0]
    entropy  = float(-np.sum(hv * np.log(hv + 1e-9)))

    rms      = librosa.feature.rms(y=audio, frame_length=2048, hop_length=512)[0]
    zcr      = librosa.feature.zero_crossing_rate(audio, frame_length=2048, hop_length=512)[0]
    sf       = librosa.feature.spectral_flatness(y=audio, hop_length=512)[0]

    hnr_m, hnr_s = compute_hnr(audio, f0, vmask, sr)
    shim         = compute_shimmer(audio, f0, vmask, sr)

    log_vf0 = np.log(vf0 + 1e-9)
    sem_rng = float(12.0 * np.log2((np.max(vf0) + 1e-9) / (np.min(vf0) + 1e-9)))

    trans   = np.diff(vmask.astype(int))
    ss      = np.where(trans == 1)[0]
    se      = np.where(trans == -1)[0]
    if vmask[0]:  ss = np.concatenate([[0], ss])
    if vmask[-1]: se = np.concatenate([se, [len(vmask) - 1]])
    n_segs  = len(ss)
    sl      = (se - ss) if len(ss) == len(se) else np.array([1])

    ac1 = float(np.corrcoef(vf0[:-1], vf0[1:])[0, 1]) if len(vf0) > 2 else 0.0

    return {
        'f0_mean':           mf0,
        'f0_std':            float(np.std(vf0)),
        'f0_min':            float(np.min(vf0)),
        'f0_max':            float(np.max(vf0)),
        'f0_range':          float(np.max(vf0) - np.min(vf0)),
        'f0_median':         float(np.median(vf0)),
        'f0_slope':          slope,
        'f0_iqr':            float(np.percentile(vf0, 75) - np.percentile(vf0, 25)),
        'voiced_fraction':   float(vfrac),
        'jitter':            jitter,
        'mean_delta_f0':     float(np.mean(d1)) if len(d1) else 0.0,
        'std_delta_f0':      float(np.std(d1))  if len(d1) else 0.0,
        'mean_delta2_f0':    float(np.mean(d2)),
        'f0_skewness':       float(skew(vf0)),
        'f0_kurtosis':       float(kurtosis(vf0)),
        'f0_entropy':        entropy,
        'rms_mean':          float(np.mean(rms)),
        'rms_std':           float(np.std(rms)),
        'rms_max':           float(np.max(rms)),
        'rms_range':         float(np.max(rms) - np.min(rms)),
        'zcr_mean':          float(np.mean(zcr)),
        'zcr_std':           float(np.std(zcr)),
        'f0_p10':            float(np.percentile(vf0, 10)),
        'f0_p90':            float(np.percentile(vf0, 90)),
        'high_pitch_ratio':  float(np.mean(vf0 > 200)),
        'contour_smooth':    float(np.mean(np.abs(np.diff(np.diff(vf0))))) if len(vf0) > 2 else 0.0,
        'hnr_mean':          hnr_m,
        'hnr_std':           hnr_s,
        'shimmer':           shim,
        'log_f0_mean':       float(np.mean(log_vf0)),
        'log_f0_std':        float(np.std(log_vf0)),
        'semitone_range':    sem_rng,
        'n_voiced_segments': float(n_segs),
        'mean_voiced_dur':   float(np.mean(sl)) if len(sl) else 0.0,
        'std_voiced_dur':    float(np.std(sl))  if len(sl) > 1 else 0.0,
        'spectral_flatness_mean': float(np.mean(sf)),
        'spectral_flatness_std':  float(np.std(sf)),
        'pitch_autocorr_lag1':    ac1,
        'low_pitch_ratio':        float(np.mean(vf0 < 130)),
    }

V3_FEATURES = [
    'f0_mean', 'f0_std', 'f0_min', 'f0_max', 'f0_range',
    'f0_median', 'f0_slope', 'f0_iqr', 'voiced_fraction',
    'jitter', 'mean_delta_f0', 'std_delta_f0', 'mean_delta2_f0',
    'f0_skewness', 'f0_kurtosis', 'f0_entropy',
    'rms_mean', 'rms_std', 'rms_max', 'rms_range',
    'zcr_mean', 'zcr_std',
    'f0_p10', 'f0_p90', 'high_pitch_ratio', 'contour_smooth',
    'hnr_mean', 'hnr_std', 'shimmer',
    'log_f0_mean', 'log_f0_std', 'semitone_range',
    'n_voiced_segments', 'mean_voiced_dur', 'std_voiced_dur',
    'spectral_flatness_mean', 'spectral_flatness_std',
    'pitch_autocorr_lag1', 'low_pitch_ratio',
]

def build_cache():
    all_files = []
    for emotion in EMOTIONS:
        folder = DATASET_DIR / emotion
        if not folder.exists(): continue
        for w in sorted(folder.glob('*.wav')):
            all_files.append((w, emotion))
    total = len(all_files)
    print(f'Extracting v3 features from {total} files (noise-gate + median-filter)...')
    rows, failed, start = [], 0, time.time()
    for i, (wav, emotion) in enumerate(all_files):
        if i % 2000 == 0 and i > 0:
            e  = time.time() - start
            eta = (total - i) / (i / e)
            print(f'  [{i}/{total}] elapsed {e:.0f}s  ETA {eta:.0f}s')
        try:
            audio, sr2 = librosa.load(str(wav), sr=SR, mono=True)
            feats = extract_v3(audio, sr2)
            if feats:
                rows.append({'file': wav.name, 'emotion': emotion, **feats})
            else:
                failed += 1
        except Exception:
            failed += 1
    print(f'Done: {len(rows)} ok, {failed} skipped')
    df = pd.DataFrame(rows)
    df.to_csv(CACHE_V3, index=False)
    print(f'Saved to {CACHE_V3}')
    return df

def train_v3():
    if CACHE_V3.exists():
        print(f'Loading {CACHE_V3}...')
        df = pd.read_csv(CACHE_V3)
        print(f'  {len(df)} samples')
    else:
        df = build_cache()

    X  = df[V3_FEATURES].values.astype(np.float64)
    le = LabelEncoder()
    y  = le.fit_transform(df['emotion'].values)
    mask = ~(np.isnan(X).any(axis=1) | np.isinf(X).any(axis=1))
    X, y = X[mask], y[mask]
    print(f'\nTraining on {len(X)} samples | {len(V3_FEATURES)} features | {len(le.classes_)} classes')

    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    hgb = HistGradientBoostingClassifier(max_iter=600, learning_rate=0.04, max_depth=7,
                                          min_samples_leaf=15, l2_regularization=0.1, random_state=42)
    rf  = RandomForestClassifier(n_estimators=500, min_samples_leaf=2,
                                  max_features='sqrt', n_jobs=-1, random_state=42)
    et  = ExtraTreesClassifier(n_estimators=400, min_samples_leaf=2,
                                max_features='sqrt', n_jobs=-1, random_state=42)
    mlp = MLPClassifier(hidden_layer_sizes=(512, 256, 128), activation='relu', max_iter=400,
                        learning_rate_init=0.0005, early_stopping=True, validation_fraction=0.1,
                        alpha=0.001, random_state=42)
    meta = LogisticRegression(C=2.0, max_iter=500, random_state=42)

    stacker = StackingClassifier(
        estimators=[('hgb', hgb), ('rf', rf), ('et', et), ('mlp', mlp)],
        final_estimator=meta, cv=3,
        stack_method='predict_proba', n_jobs=1, passthrough=False
    )

    print('\nRunning 3-fold CV on stacking ensemble...')
    cv     = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    scores = cross_val_score(stacker, X_scaled, y, cv=cv, scoring='f1_weighted', n_jobs=1)
    mean_f1, std_f1 = scores.mean(), scores.std()
    print(f'CV Weighted F1: {mean_f1:.3f} (+/- {std_f1:.3f})')
    for tag, prev in [('v1', 0.658), ('v2', 0.678)]:
        d = mean_f1 - prev
        print(f'  vs {tag} ({prev:.3f}): {"+" if d>=0 else ""}{d:.3f}')

    print('\nFitting final stacker on full dataset...')
    stacker.fit(X_scaled, y)

    pickle.dump(stacker, open(MODEL_V3,   'wb'))
    pickle.dump(scaler,  open(SCALER_V3,  'wb'))
    pickle.dump(le,      open(ENCODER_V3, 'wb'))
    print(f'Saved model  -> {MODEL_V3}')
    print(f'Saved scaler -> {SCALER_V3}')
    print(f'Saved encoder-> {ENCODER_V3}')
    print('\nPer-class report (training set):')
    print(classification_report(y, stacker.predict(X_scaled), target_names=le.classes_))

if __name__ == '__main__':
    train_v3()
