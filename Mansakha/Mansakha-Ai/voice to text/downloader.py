import os
import sys
import zipfile
import urllib.request
from typing import Optional

# Reconfigure stdout/stderr for UTF-8 on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

SUPPORTED_LANGUAGES = {
    "hi": {
        "name": "Hindi",
        "native": "हिन्दी",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/hindi_models.zip",
        "hf_id": "parthiv11/indic_whisper_hi_multi_gpu",
        "dir_name": "whisper-medium-hi_alldata_multigpu"
    },
    "bn": {
        "name": "Bengali",
        "native": "বাংলা",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/bengali_models.zip",
        "dir_name": "whisper-medium-bn_alldata_multigpu"
    },
    "gu": {
        "name": "Gujarati",
        "native": "ગુજરાતી",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/gujarati_models.zip",
        "dir_name": "whisper-medium-gu_alldata_multigpu"
    },
    "kn": {
        "name": "Kannada",
        "native": "ಕನ್ನಡ",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/kannada_models.zip",
        "dir_name": "whisper-medium-kn_alldata_multigpu"
    },
    "ml": {
        "name": "Malayalam",
        "native": "മലയാളം",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/malayalam_models.zip",
        "hf_id": "kavyamanohar/AI4B-Indicwhisper-ml",
        "dir_name": "whisper-medium-ml_alldata_multigpu"
    },
    "mr": {
        "name": "Marathi",
        "native": "मराठी",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/marathi_models.zip",
        "dir_name": "whisper-medium-mr_alldata_multigpu"
    },
    "or": {
        "name": "Odia",
        "native": "ଓଡ଼ିଆ",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/odia_models.zip",
        "hf_id": "kavyamanohar/AI4B-Indicwhisper-or",
        "dir_name": "whisper-medium-or_alldata_multigpu"
    },
    "pa": {
        "name": "Punjabi",
        "native": "ਪੰਜਾਬੀ",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/punjabi_models.zip",
        "dir_name": "whisper-medium-pa_alldata_multigpu"
    },
    "sa": {
        "name": "Sanskrit",
        "native": "संस्कृतम्",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/sanskrit_models.zip",
        "dir_name": "whisper-medium-sa_alldata_multigpu"
    },
    "ta": {
        "name": "Tamil",
        "native": "தமிழ்",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/tamil_models.zip",
        "dir_name": "whisper-medium-ta_alldata_multigpu"
    },
    "te": {
        "name": "Telugu",
        "native": "తెలుగు",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/telugu_models.zip",
        "dir_name": "whisper-medium-te_alldata_multigpu"
    },
    "ur": {
        "name": "Urdu",
        "native": "اردو",
        "model_url": "https://indicwhisper.objectstore.e2enetworks.net/urdu_models.zip",
        "dir_name": "whisper-medium-ur_alldata_multigpu"
    },
    "en": {
        "name": "English",
        "native": "English",
        "hf_id": "openai/whisper-medium",
        "dir_name": "whisper-medium-en"
    }
}

def get_model_path_or_id(lang_code: str) -> str:
    """
    Returns local folder path if downloaded, or HF model ID if available,
    or downloads the model from official AI4Bharat storage.
    """
    lang_code = lang_code.lower().strip()
    if lang_code not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language code '{lang_code}'. Supported: {list(SUPPORTED_LANGUAGES.keys())}")

    info = SUPPORTED_LANGUAGES[lang_code]
    target_dir = os.path.join(MODELS_DIR, lang_code)

    # 1. Check if model files already exist locally in MODELS_DIR/{lang_code}
    if os.path.isdir(target_dir):
        for root, _, files in os.walk(target_dir):
            if any(f in files for f in ("pytorch_model.bin", "model.safetensors")):
                return root

    # 2. If HF model ID is available, prefer HF model ID
    if "hf_id" in info:
        return info["hf_id"]

    # 3. Download from AI4Bharat object store
    url = info.get("model_url")
    if not url:
        raise RuntimeError(f"No download URL or HF ID found for language '{lang_code}'")

    os.makedirs(MODELS_DIR, exist_ok=True)
    zip_path = os.path.join(MODELS_DIR, f"{lang_code}_models.zip")

    print(f"Downloading {info['name']} IndicWhisper model from {url}...")
    _download_with_progress(url, zip_path)

    print(f"Extracting {zip_path} to {target_dir}...")
    os.makedirs(target_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(target_dir)

    try:
        os.remove(zip_path)
    except OSError:
        pass

    for root, _, files in os.walk(target_dir):
        if any(f in files for f in ("pytorch_model.bin", "model.safetensors")):
            return root

    return target_dir

def _download_with_progress(url: str, dest_path: str):
    def reporthook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = downloaded * 100 / total_size
            mb_down = downloaded / (1024 * 1024)
            mb_tot = total_size / (1024 * 1024)
            sys.stdout.write(f"\rDownloading: {percent:.1f}% ({mb_down:.1f} MB / {mb_tot:.1f} MB)")
            sys.stdout.flush()
        else:
            mb_down = downloaded / (1024 * 1024)
            sys.stdout.write(f"\rDownloading: {mb_down:.1f} MB")
            sys.stdout.flush()

    urllib.request.urlretrieve(url, dest_path, reporthook=reporthook)
    sys.stdout.write("\nDownload complete.\n")
    sys.stdout.flush()

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Download IndicWhisper models")
    parser.add_argument("--language", "-l", default="hi", choices=list(SUPPORTED_LANGUAGES.keys()),
                        help="Language code (e.g., hi, ta, te, bn, gu, mr, ur, ml, pa, kn, or, sa)")
    args = parser.parse_args()
    path = get_model_path_or_id(args.language)
    print(f"Model path / id for {args.language}: {path}")
