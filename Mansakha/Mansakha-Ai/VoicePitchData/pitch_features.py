import numpy as np
from scipy.stats import skew, kurtosis


def extract_pitch_features(audio, sr):
    import librosa

    fmin = librosa.note_to_hz('C2')   # ~65 Hz
    fmax = librosa.note_to_hz('C7')   # ~2093 Hz

    f0 = librosa.yin(
        audio,
        fmin=fmin,
        fmax=fmax,
        sr=sr,
        frame_length=2048,
        hop_length=512,
    )

    # YIN has no voiced_flag — threshold: discard frames at fmin boundary (unvoiced)
    voiced_flag = (f0 > fmin * 1.05) & (f0 < fmax * 0.95)
    voiced_f0 = f0[voiced_flag]

    if len(voiced_f0) < 5:
        return None

    voiced_fraction = voiced_flag.sum() / max(len(voiced_flag), 1)
    delta_f0 = np.diff(voiced_f0)
    delta2_f0 = np.diff(delta_f0) if len(delta_f0) > 1 else np.array([0.0])

    mean_f0 = np.mean(voiced_f0)
    jitter = (
        np.mean(np.abs(delta_f0)) / mean_f0
        if mean_f0 > 0 and len(delta_f0) > 0 else 0.0
    )

    x = np.arange(len(voiced_f0))
    slope = np.polyfit(x, voiced_f0, 1)[0] if len(voiced_f0) > 1 else 0.0

    hist, _ = np.histogram(voiced_f0, bins=20, density=True)
    hist = hist[hist > 0]
    entropy = -np.sum(hist * np.log(hist + 1e-9))

    return {
        'f0_mean':        mean_f0,
        'f0_std':         np.std(voiced_f0),
        'f0_min':         np.min(voiced_f0),
        'f0_max':         np.max(voiced_f0),
        'f0_range':       np.max(voiced_f0) - np.min(voiced_f0),
        'f0_median':      np.median(voiced_f0),
        'f0_slope':       slope,
        'f0_iqr':         float(np.percentile(voiced_f0, 75) - np.percentile(voiced_f0, 25)),
        'voiced_fraction': float(voiced_fraction),
        'jitter':         float(jitter),
        'mean_delta_f0':  float(np.mean(delta_f0)) if len(delta_f0) > 0 else 0.0,
        'std_delta_f0':   float(np.std(delta_f0))  if len(delta_f0) > 0 else 0.0,
        'mean_delta2_f0': float(np.mean(delta2_f0)),
        'f0_skewness':    float(skew(voiced_f0)),
        'f0_kurtosis':    float(kurtosis(voiced_f0)),
        'f0_entropy':     float(entropy),
    }


FEATURE_NAMES = [
    'f0_mean', 'f0_std', 'f0_min', 'f0_max', 'f0_range',
    'f0_median', 'f0_slope', 'f0_iqr', 'voiced_fraction',
    'jitter', 'mean_delta_f0', 'std_delta_f0', 'mean_delta2_f0',
    'f0_skewness', 'f0_kurtosis', 'f0_entropy',
]
