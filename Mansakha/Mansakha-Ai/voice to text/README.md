# 🎙️ IndicWhisper Local Voice-to-Text

A local, multilingual Automatic Speech Recognition (ASR) system using **AI4Bharat IndicWhisper** models fine-tuned on 10,700+ hours of Indian audio datasets.

No fine-tuning needed — ready for immediate inference on GPU (NVIDIA RTX 2050 CUDA) or CPU.

---

## 🇮🇳 Supported Languages

| Code | Language | Native Name | Model Source |
| :--- | :--- | :--- | :--- |
| `hi` | **Hindi** | हिन्दी | AI4Bharat / Vistaar (`parthiv11/indic_whisper_hi_multi_gpu`) |
| `bn` | **Bengali** | বাংলা | AI4Bharat Vistaar ObjectStore |
| `gu` | **Gujarati** | ગુજરાતી | AI4Bharat Vistaar ObjectStore |
| `kn` | **Kannada** | ಕನ್ನಡ | AI4Bharat Vistaar ObjectStore |
| `ml` | **Malayalam** | മലയാളം | AI4Bharat / Vistaar (`kavyamanohar/AI4B-Indicwhisper-ml`) |
| `mr` | **Marathi** | मराठी | AI4Bharat Vistaar ObjectStore |
| `or` | **Odia** | ଓଡ଼ିଆ | AI4Bharat / Vistaar (`kavyamanohar/AI4B-Indicwhisper-or`) |
| `pa` | **Punjabi** | ਪੰਜਾਬੀ | AI4Bharat Vistaar ObjectStore |
| `sa` | **Sanskrit** | संस्कृतम् | AI4Bharat Vistaar ObjectStore |
| `ta` | **Tamil** | தமிழ் | AI4Bharat Vistaar ObjectStore |
| `te` | **Telugu** | తెలుగు | AI4Bharat Vistaar ObjectStore |
| `ur` | **Urdu** | اردو | AI4Bharat Vistaar ObjectStore |
| `en` | **English** | English | Multilingual Whisper |

---

## 🚀 Quick Start

### 1. Launch the Web Interface (Recommended)
Run the Gradio Web UI to record directly from your microphone or upload any audio file:

```bash
python app.py
```
Open **http://127.0.0.1:7860** in your web browser.

### 2. Command Line Interface (CLI)

- **Transcribe an audio file:**
  ```bash
  python cli.py --audio sample.mp3 --language hi
  ```

- **Save transcription to a text file:**
  ```bash
  python cli.py --audio speech.wav --language ta --output output.txt
  ```

- **Record directly from your microphone (e.g. 5 seconds):**
  ```bash
  python cli.py --record 5 --language hi
  ```

- **List all supported languages:**
  ```bash
  python cli.py --list-languages
  ```

### 3. Python API

```python
from indic_transcribe import transcribe

# Transcribe an audio file in Hindi
text = transcribe("sample.mp3", lang_code="hi")
print(text)

# Transcribe Tamil
tamil_text = transcribe("tamil_audio.wav", lang_code="ta")
print(tamil_text)
```

---

## ⚙️ Hardware Acceleration

- Automatically uses **NVIDIA CUDA** (`torch.float16`) if a compatible GPU is detected.
- Uses ~1.8 GB VRAM, fitting comfortably within 4 GB GPUs (like RTX 2050).
- Automatically falls back to CPU if no GPU is available.
