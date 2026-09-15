import os, time, pickle, warnings
import numpy as np
import pandas as pd
import librosa
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier, VotingClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report
from pitch_features import FEATURE_NAMES

warnings.filterwarnings("ignore")

DATASET_DIR = Path("Voice Emotion Dataset")
CACHE_V2    = Path("pitch_features_cache_v2.csv")
MODEL_V2    = Path("pitch_emotion_model_v2.pkl")
SCALER_V2   = Path("pitch_scaler_v2.pkl")
ENCODER_V2  = Path("pitch_label_encoder_v2.pkl")
EMOTIONS    = ["anger", "disgust", "fear", "happy", "neutral", "sad"]
SR          = 22050

V2_EXTRA = [
    "rms_mean", "rms_std", "rms_max", "rms_range",
    "zcr_mean", "zcr_std",
    "f0_p10", "f0_p90", "high_pitch_ratio", "contour_smooth",
]
V2_FEATURES = FEATURE_NAMES + V2_EXTRA


def extract_v2(audio, sr):
    from pitch_features import extract_pitch_features
    base = extract_pitch_features(audio, sr)
    if base is None:
        return None

    rms = librosa.feature.rms(y=audio, frame_length=2048, hop_length=512)[0]
    zcr = librosa.feature.zero_crossing_rate(audio, frame_length=2048, hop_length=512)[0]

    fmin_hz = librosa.note_to_hz("C2")
    fmax_hz = librosa.note_to_hz("C7")
    f0 = librosa.yin(audio, fmin=fmin_hz, fmax=fmax_hz, sr=sr,
                     frame_length=2048, hop_length=512)
    voiced = (f0 > fmin_hz * 1.05) & (f0 < fmax_hz * 0.95)
    vf0 = f0[voiced]
    if len(vf0) < 5:
        return None

    smooth = float(np.mean(np.abs(np.diff(np.diff(vf0))))) if len(vf0) > 2 else 0.0

    extra = {
        "rms_mean":         float(np.mean(rms)),
        "rms_std":          float(np.std(rms)),
        "rms_max":          float(np.max(rms)),
        "rms_range":        float(np.max(rms) - np.min(rms)),
        "zcr_mean":         float(np.mean(zcr)),
        "zcr_std":          float(np.std(zcr)),
        "f0_p10":           float(np.percentile(vf0, 10)),
        "f0_p90":           float(np.percentile(vf0, 90)),
        "high_pitch_ratio": float(np.mean(vf0 > 200)),
        "contour_smooth":   smooth,
    }
    return {**base, **extra}


def build_cache():
    all_files = []
    for emotion in EMOTIONS:
        folder = DATASET_DIR / emotion
        if not folder.exists():
            continue
        for w in folder.glob("*.wav"):
            all_files.append((w, emotion))

    total = len(all_files)
    print(f"Extracting v2 features from {total} files...")
    rows, failed, start = [], 0, time.time()

    for i, (wav_path, emotion) in enumerate(all_files):
        if i % 2000 == 0 and i > 0:
            eta = (total - i) / (i / (time.time() - start))
            print(f"  [{i}/{total}] ETA {eta:.0f}s")
        try:
            audio, sr2 = librosa.load(str(wav_path), sr=SR, mono=True)
            feats = extract_v2(audio, sr2)
            if feats:
                rows.append({"file": wav_path.name, "emotion": emotion, **feats})
            else:
                failed += 1
        except Exception:
            failed += 1

    print(f"Done: {len(rows)} ok, {failed} skipped")
    df = pd.DataFrame(rows)
    df.to_csv(CACHE_V2, index=False)
    print(f"Saved to {CACHE_V2}")
    return df


def train_v2():
    if CACHE_V2.exists():
        print(f"Loading cached v2 features from {CACHE_V2}...")
        df = pd.read_csv(CACHE_V2)
        print(f"  {len(df)} samples loaded")
    else:
        df = build_cache()

    X  = df[V2_FEATURES].values.astype(np.float64)
    le = LabelEncoder()
    y  = le.fit_transform(df["emotion"].values)
    mask = ~np.isnan(X).any(axis=1)
    X, y = X[mask], y[mask]

    n_feat = len(V2_FEATURES)
    print(f"Training on {len(X)} samples | {n_feat} features | {len(le.classes_)} classes")
    print(f"Classes: {list(le.classes_)}")

    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Model 1: HistGradientBoosting (LightGBM-style, handles large data fast)
    hgb = HistGradientBoostingClassifier(
        max_iter=500, learning_rate=0.05,
        max_depth=6, min_samples_leaf=20,
        random_state=42
    )

    # Model 2: Random Forest (500 trees, ensemble diversity)
    rf = RandomForestClassifier(
        n_estimators=500, min_samples_leaf=2,
        max_features="sqrt", n_jobs=-1, random_state=42
    )

    # Model 3: MLP Neural Network (2 hidden layers)
    mlp = MLPClassifier(
        hidden_layer_sizes=(256, 128, 64),
        activation="relu", max_iter=300,
        learning_rate_init=0.001,
        early_stopping=True, validation_fraction=0.1,
        random_state=42
    )

    ensemble = VotingClassifier(
        estimators=[("hgb", hgb), ("rf", rf), ("mlp", mlp)],
        voting="soft",
        weights=[2, 1, 1],
        n_jobs=1
    )

    print("\nRunning 3-fold cross-validation...")
    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    scores = cross_val_score(ensemble, X_scaled, y, cv=cv,
                             scoring="f1_weighted", n_jobs=1)
    mean_f1 = scores.mean()
    std_f1  = scores.std()
    print(f"CV Weighted F1: {mean_f1:.3f} (+/- {std_f1:.3f})")
    v1_f1 = 0.658
    delta = mean_f1 - v1_f1
    sign  = "+" if delta >= 0 else ""
    print(f"vs v1 (0.658): {sign}{delta:.3f}")

    print("\nFitting final model on full dataset...")
    ensemble.fit(X_scaled, y)

    pickle.dump(ensemble, open(MODEL_V2,   "wb"))
    pickle.dump(scaler,   open(SCALER_V2,  "wb"))
    pickle.dump(le,       open(ENCODER_V2, "wb"))

    print(f"\nSaved model  -> {MODEL_V2}")
    print(f"Saved scaler -> {SCALER_V2}")
    print(f"Saved encoder-> {ENCODER_V2}")

    print("\nPer-class report (training set):")
    print(classification_report(y, ensemble.predict(X_scaled), target_names=le.classes_))


if __name__ == "__main__":
    train_v2()
