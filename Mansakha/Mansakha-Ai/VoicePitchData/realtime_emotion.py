"""
realtime_emotion.py
--------------------
Real-time pitch-based emotion detector.
Listens to the microphone, extracts pitch features in a sliding window,
and displays live emotion predictions on a matplotlib dashboard.

Run: python realtime_emotion.py
Press Ctrl+C or close the window to stop.
"""

import time, pickle, queue, threading, warnings
import numpy as np
import sounddevice as sd
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import matplotlib.patches as mpatches
from pathlib import Path
from pitch_features import extract_pitch_features, FEATURE_NAMES
import librosa

warnings.filterwarnings("ignore")

# ── Config — auto-selects v2 model if available ───────────────────────────────
SAMPLE_RATE = 22050
WINDOW_SEC  = 2.0    # analysis window length
HOP_SEC     = 0.3    # how often to re-predict
HISTORY_LEN = 40     # number of past predictions shown in history strip

# v2 extra features (must match train_v2.py V2_EXTRA list)
V2_EXTRA = [
    "rms_mean", "rms_std", "rms_max", "rms_range",
    "zcr_mean", "zcr_std",
    "f0_p10", "f0_p90", "high_pitch_ratio", "contour_smooth",
]

USE_V2 = Path("pitch_emotion_model_v2.pkl").exists()
if USE_V2:
    MODEL_FILE   = Path("pitch_emotion_model_v2.pkl")
    SCALER_FILE  = Path("pitch_scaler_v2.pkl")
    ENCODER_FILE = Path("pitch_label_encoder_v2.pkl")
    ACTIVE_FEATURES = FEATURE_NAMES + V2_EXTRA
    print("Using v2 model (HGB + RF + MLP, 26 features)")
else:
    MODEL_FILE   = Path("pitch_emotion_model.pkl")
    SCALER_FILE  = Path("pitch_scaler.pkl")
    ENCODER_FILE = Path("pitch_label_encoder.pkl")
    ACTIVE_FEATURES = FEATURE_NAMES
    print("Using v1 model (LinearSVM + RF, 16 features)")

EMOTION_COLORS = {
    "anger":   "#e74c3c",
    "disgust": "#8e44ad",
    "fear":    "#f39c12",
    "happy":   "#2ecc71",
    "neutral": "#95a5a6",
    "sad":     "#3498db",
}

EMOTION_EMOJI = {
    "anger":   "😠",
    "disgust": "🤢",
    "fear":    "😨",
    "happy":   "😊",
    "neutral": "😐",
    "sad":     "😢",
}

# ── Load model ────────────────────────────────────────────────────────────────
def load_model():
    if not MODEL_FILE.exists():
        raise FileNotFoundError(
            f"Model not found at {MODEL_FILE}.\n"
            "Please run: python train_pitch_classifier.py"
        )
    with open(MODEL_FILE, "rb") as f:
        model = pickle.load(f)
    with open(SCALER_FILE, "rb") as f:
        scaler = pickle.load(f)
    with open(ENCODER_FILE, "rb") as f:
        le = pickle.load(f)
    return model, scaler, le

# ── Shared state ──────────────────────────────────────────────────────────────
audio_buffer = []
buffer_lock  = threading.Lock()
result_queue = queue.Queue()

current_emotion     = "..."
current_confidence  = {}
emotion_history     = []
f0_history          = []

# ── Audio callback ─────────────────────────────────────────────────────────────
def audio_callback(indata, frames, time_info, status):
    with buffer_lock:
        audio_buffer.extend(indata[:, 0].tolist())
        max_samples = int(WINDOW_SEC * SAMPLE_RATE * 2)
        if len(audio_buffer) > max_samples:
            del audio_buffer[:len(audio_buffer) - max_samples]

# ── Inference thread ──────────────────────────────────────────────────────────
def inference_loop(model, scaler, le):
    window_samples = int(WINDOW_SEC * SAMPLE_RATE)
    hop_samples    = int(HOP_SEC    * SAMPLE_RATE)

    while True:
        time.sleep(HOP_SEC)
        with buffer_lock:
            buf = list(audio_buffer)

        if len(buf) < window_samples:
            continue

        audio = np.array(buf[-window_samples:], dtype=np.float32)

        # Extract pitch features (v1 base always, v2 extras if using v2 model)
        try:
            feats = extract_pitch_features(audio, SAMPLE_RATE)
        except Exception:
            feats = None

        if feats is None:
            result_queue.put(("silence", {e: 0.0 for e in le.classes_}, []))
            continue

        # Add v2 extra features if needed
        if USE_V2:
            try:
                rms = librosa.feature.rms(y=audio, frame_length=2048, hop_length=512)[0]
                zcr = librosa.feature.zero_crossing_rate(audio, frame_length=2048, hop_length=512)[0]
                fmin_hz = librosa.note_to_hz("C2")
                fmax_hz = librosa.note_to_hz("C7")
                f0_all  = librosa.yin(audio, fmin=fmin_hz, fmax=fmax_hz,
                                      sr=SAMPLE_RATE, frame_length=2048, hop_length=512)
                v_mask  = (f0_all > fmin_hz * 1.05) & (f0_all < fmax_hz * 0.95)
                vf0     = f0_all[v_mask]
                if len(vf0) < 5:
                    result_queue.put(("silence", {e: 0.0 for e in le.classes_}, []))
                    continue
                smooth = float(np.mean(np.abs(np.diff(np.diff(vf0))))) if len(vf0) > 2 else 0.0
                feats.update({
                    "rms_mean": float(np.mean(rms)), "rms_std": float(np.std(rms)),
                    "rms_max":  float(np.max(rms)),  "rms_range": float(np.max(rms)-np.min(rms)),
                    "zcr_mean": float(np.mean(zcr)), "zcr_std": float(np.std(zcr)),
                    "f0_p10":   float(np.percentile(vf0, 10)),
                    "f0_p90":   float(np.percentile(vf0, 90)),
                    "high_pitch_ratio": float(np.mean(vf0 > 200)),
                    "contour_smooth":   smooth,
                })
                f0_for_display = np.where(v_mask, f0_all, np.nan)
            except Exception:
                result_queue.put(("silence", {e: 0.0 for e in le.classes_}, []))
                continue
        else:
            fmin_hz = librosa.note_to_hz("C2")
            fmax_hz = librosa.note_to_hz("C7")
            f0_all  = librosa.yin(audio, fmin=fmin_hz, fmax=fmax_hz,
                                  sr=SAMPLE_RATE, frame_length=2048, hop_length=512)
            v_mask  = (f0_all > fmin_hz * 1.05) & (f0_all < fmax_hz * 0.95)
            f0_for_display = np.where(v_mask, f0_all, np.nan)

        # Build feature vector using active feature set
        x = np.array([feats.get(k, 0.0) for k in ACTIVE_FEATURES]).reshape(1, -1)
        if np.isnan(x).any():
            continue
        x_scaled = scaler.transform(x)

        proba      = model.predict_proba(x_scaled)[0]
        pred_idx   = np.argmax(proba)
        pred_label = le.inverse_transform([pred_idx])[0]
        conf_dict  = {le.classes_[i]: float(proba[i]) for i in range(len(le.classes_))}

        result_queue.put((pred_label, conf_dict, f0_for_display.tolist()))

# ── Dashboard ─────────────────────────────────────────────────────────────────
def run_dashboard(model, scaler, le):
    EMOTIONS = list(le.classes_)

    fig = plt.figure(figsize=(14, 8), facecolor="#1a1a2e")
    fig.suptitle("🎙️  Real-Time Pitch Emotion Detector", fontsize=16,
                 color="white", fontweight="bold", y=0.98)

    gs = fig.add_gridspec(3, 2, hspace=0.45, wspace=0.35,
                          left=0.07, right=0.97, top=0.92, bottom=0.06)

    ax_label  = fig.add_subplot(gs[0, 0])   # Big emotion label
    ax_conf   = fig.add_subplot(gs[1, 0])   # Confidence bars
    ax_pitch  = fig.add_subplot(gs[0:2, 1]) # Pitch contour
    ax_hist   = fig.add_subplot(gs[2, :])   # Emotion history strip

    for ax in [ax_label, ax_conf, ax_pitch, ax_hist]:
        ax.set_facecolor("#16213e")
        ax.tick_params(colors="white")
        ax.xaxis.label.set_color("white")
        ax.yaxis.label.set_color("white")
        for spine in ax.spines.values():
            spine.set_edgecolor("#444466")

    # -- Label panel --
    ax_label.set_xlim(0, 1); ax_label.set_ylim(0, 1)
    ax_label.axis("off")
    emotion_text = ax_label.text(0.5, 0.65, "...", ha="center", va="center",
                                 fontsize=38, fontweight="bold", color="white",
                                 transform=ax_label.transAxes)
    conf_text = ax_label.text(0.5, 0.25, "", ha="center", va="center",
                              fontsize=14, color="#aaaacc",
                              transform=ax_label.transAxes)
    ax_label.set_title("Detected Emotion", color="#aaaacc", fontsize=11)

    # -- Confidence bars --
    bar_colors = [EMOTION_COLORS.get(e, "#888888") for e in EMOTIONS]
    bars = ax_conf.bar(EMOTIONS, [0]*len(EMOTIONS), color=bar_colors, edgecolor="none")
    ax_conf.set_ylim(0, 1)
    ax_conf.set_ylabel("Confidence", color="white")
    ax_conf.set_title("Class Probabilities", color="#aaaacc", fontsize=11)
    ax_conf.tick_params(axis="x", labelsize=9, colors="white")

    # -- Pitch contour --
    pitch_line, = ax_pitch.plot([], [], color="#00d4ff", lw=1.5, alpha=0.85)
    ax_pitch.set_ylim(50, 500)
    ax_pitch.set_ylabel("F0 (Hz)", color="white")
    ax_pitch.set_title("Live Pitch Contour", color="#aaaacc", fontsize=11)
    ax_pitch.set_xlabel("Frames", color="white")

    # -- History strip --
    history_patches = []
    for i in range(HISTORY_LEN):
        rect = mpatches.FancyBboxPatch(
            (i / HISTORY_LEN, 0.1), 1 / HISTORY_LEN - 0.005, 0.8,
            boxstyle="round,pad=0.01",
            facecolor="#333355", edgecolor="none",
            transform=ax_hist.transAxes, clip_on=False
        )
        ax_hist.add_patch(rect)
        history_patches.append(rect)
    history_labels = [
        ax_hist.text(
            (i + 0.5) / HISTORY_LEN, 0.5, "",
            ha="center", va="center", fontsize=12,
            transform=ax_hist.transAxes, clip_on=False
        )
        for i in range(HISTORY_LEN)
    ]
    ax_hist.axis("off")
    ax_hist.set_title("Emotion History  (newest → right)", color="#aaaacc",
                      fontsize=11, loc="left")

    def update(frame):
        global current_emotion, current_confidence, emotion_history, f0_history

        # Drain result queue
        while not result_queue.empty():
            label, conf, f0 = result_queue.get_nowait()
            current_emotion    = label
            current_confidence = conf
            if label != "silence":
                emotion_history.append(label)
                if len(emotion_history) > HISTORY_LEN:
                    emotion_history = emotion_history[-HISTORY_LEN:]
            if f0:
                f0_history = f0

        # Update label
        emo = current_emotion
        color = EMOTION_COLORS.get(emo, "white")
        emoji = EMOTION_EMOJI.get(emo, "")
        emotion_text.set_text(f"{emoji} {emo.upper()}")
        emotion_text.set_color(color)
        top_conf = current_confidence.get(emo, 0)
        conf_text.set_text(f"confidence: {top_conf:.0%}")

        # Update confidence bars
        for bar, e in zip(bars, EMOTIONS):
            bar.set_height(current_confidence.get(e, 0))
            bar.set_facecolor(
                EMOTION_COLORS.get(e, "#888888")
                if e == emo else "#334466"
            )

        # Update pitch contour
        f0_arr = np.array(f0_history, dtype=float)
        if len(f0_arr) > 0:
            pitch_line.set_data(np.arange(len(f0_arr)), f0_arr)
            ax_pitch.set_xlim(0, max(len(f0_arr), 1))

        # Update history strip
        for i, patch in enumerate(history_patches):
            if i < len(emotion_history):
                e = emotion_history[i]
                patch.set_facecolor(EMOTION_COLORS.get(e, "#333355"))
                history_labels[i].set_text(EMOTION_EMOJI.get(e, ""))
            else:
                patch.set_facecolor("#333355")
                history_labels[i].set_text("")

        return [emotion_text, conf_text, pitch_line] + bars.patches + history_patches + history_labels

    ani = animation.FuncAnimation(fig, update, interval=300, blit=False, cache_frame_data=False)

    # Start mic stream + inference thread
    inf_thread = threading.Thread(target=inference_loop, args=(model, scaler, le), daemon=True)
    inf_thread.start()

    stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
        callback=audio_callback,
        blocksize=int(SAMPLE_RATE * 0.05),
    )

    print("Microphone open. Speak to detect emotions. Close the window to stop.")
    with stream:
        plt.show()


if __name__ == "__main__":
    print("Loading model...")
    model, scaler, le = load_model()
    print(f"Model loaded. Classes: {list(le.classes_)}")
    run_dashboard(model, scaler, le)
