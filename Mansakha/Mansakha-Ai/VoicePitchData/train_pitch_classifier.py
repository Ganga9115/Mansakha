"""
train_pitch_classifier.py
--------------------------
Extracts pitch features from all WAV files in the dataset,
trains an SVM classifier, and saves the model + scaler.

Features cached to pitch_features_cache.csv to avoid re-extraction.
Run: python train_pitch_classifier.py
"""

import os, sys, time, pickle, csv
import numpy as np
import pandas as pd
import librosa
from pathlib import Path
from sklearn.svm import SVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix
from pitch_features import extract_pitch_features, FEATURE_NAMES

DATASET_DIR = Path("Voice Emotion Dataset")
CACHE_FILE  = Path("pitch_features_cache.csv")
MODEL_FILE  = Path("pitch_emotion_model.pkl")
SCALER_FILE = Path("pitch_scaler.pkl")
ENCODER_FILE = Path("pitch_label_encoder.pkl")

EMOTIONS = ["anger", "disgust", "fear", "happy", "neutral", "sad"]


def extract_all_features():
    rows = []
    all_files = []
    for emotion in EMOTIONS:
        folder = DATASET_DIR / emotion
        if not folder.exists():
            print(f"WARNING: {folder} not found, skipping.")
            continue
        wavs = list(folder.glob("*.wav"))
        for w in wavs:
            all_files.append((w, emotion))

    total = len(all_files)
    print(f"Found {total} WAV files across {len(EMOTIONS)} emotions.")
    print("Extracting pitch features (this may take 10-20 min)...")

    failed = 0
    start = time.time()
    for i, (wav_path, emotion) in enumerate(all_files):
        if i % 500 == 0 and i > 0:
            elapsed = time.time() - start
            rate = i / elapsed
            eta = (total - i) / rate
            print(f"  [{i}/{total}]  {elapsed:.0f}s elapsed  ETA {eta:.0f}s")

        try:
            audio, sr = librosa.load(str(wav_path), sr=22050, mono=True)
            feats = extract_pitch_features(audio, sr)
            if feats is None:
                failed += 1
                continue
            row = {"file": wav_path.name, "emotion": emotion}
            row.update(feats)
            rows.append(row)
        except Exception as e:
            failed += 1

    print(f"Done. {len(rows)} usable samples, {failed} failed/skipped.")
    df = pd.DataFrame(rows)
    df.to_csv(CACHE_FILE, index=False)
    print(f"Features cached to {CACHE_FILE}")
    return df


def load_or_extract():
    if CACHE_FILE.exists():
        print(f"Loading cached features from {CACHE_FILE} ...")
        df = pd.read_csv(CACHE_FILE)
        print(f"  {len(df)} samples loaded.")
        return df
    return extract_all_features()


def train():
    df = load_or_extract()

    X = df[FEATURE_NAMES].values
    le = LabelEncoder()
    y = le.fit_transform(df["emotion"].values)

    # Drop rows with NaN
    mask = ~np.isnan(X).any(axis=1)
    X, y = X[mask], y[mask]
    print(f"Training on {len(X)} samples, {len(le.classes_)} classes: {list(le.classes_)}")
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # LinearSVC scales well to large datasets (unlike RBF SVM which is O(n^2))
    # Wrapped in CalibratedClassifierCV to get probability outputs for soft voting
    linear_svm = CalibratedClassifierCV(
        SVC(kernel="linear", C=1.0, max_iter=2000), ensemble=False
    )
    rf = RandomForestClassifier(n_estimators=300, n_jobs=-1, random_state=42)
    ensemble = VotingClassifier(
        estimators=[("linear_svm", linear_svm), ("rf", rf)],
        voting="soft",
        n_jobs=-1
    )

    print("Running 3-fold cross-validation (LinearSVM + RF ensemble)...")
    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    scores = cross_val_score(ensemble, X_scaled, y, cv=cv, scoring="f1_weighted", n_jobs=1)
    print(f"CV Weighted F1: {scores.mean():.3f} (+/- {scores.std():.3f})")

    print("Training final model on full dataset...")
    ensemble.fit(X_scaled, y)

    with open(MODEL_FILE, "wb") as f:
        pickle.dump(ensemble, f)
    with open(SCALER_FILE, "wb") as f:
        pickle.dump(scaler, f)
    with open(ENCODER_FILE, "wb") as f:
        pickle.dump(le, f)

    print(f"Model saved to {MODEL_FILE}")
    print(f"Scaler saved to {SCALER_FILE}")
    print(f"Label encoder saved to {ENCODER_FILE}")


if __name__ == "__main__":
    train()
