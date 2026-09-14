"""
PS 094 -- Multilingual Text Emotion Analyzer (local test harness)
===================================================================

Loads a LOCALLY DOWNLOADED emotion-classification model
(tabularisai/multilingual-emotion-classification, an XLM-RoBERTa fine-tune)
from disk and runs real local inference. No internet access, no API calls,
no re-downloading, no retraining.

IMPORTANT -- what this model does and does NOT do:
    This model classifies EXPRESSED EMOTION in text (anger, fear, sadness,
    joy, etc.) as independent probabilities. It does NOT diagnose distress,
    depression, PTSD, mental illness, psychological crisis, suicide risk,
    or victim vulnerability. Output is always an emotion label + probability
    (e.g. "Fear = 0.78"), never a "distress score" or similar reinterpretation.

Model design note (read this before trusting a "sum to 1.0" assumption):
    The model's config.json declares problem_type = "multi_label_classification".
    It was trained with independent sigmoid outputs per emotion label (not a
    single softmax distribution). That means several emotions can legitimately
    score high at once (e.g. relief AND fear in the same sentence), and the
    11 probabilities printed below are NOT expected to sum to 1.0 -- each is
    an independent P(this emotion is expressed), and any probability > 0.5 is
    the model's own multi-label "active" decision (threshold per its model card).

Usage:
    python test_emotion.py                 Interactive mode
    python test_emotion.py --demo          Multilingual + PS094 demo test suite
    python test_emotion.py --file input.txt   Batch mode -> results.csv
"""

import argparse
import os
import sys
import time

# Windows consoles often default stdout/stderr to a legacy codepage (e.g. cp1252)
# that cannot print Hindi/Tamil/Arabic text. Force UTF-8 so multilingual output
# (and results.csv encoding) is never silently mangled or a crash.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

MODEL_PATH = r"C:\Users\yukes\Downloads\hf\MultilingualEmotion"
ACTIVE_THRESHOLD = 0.5
MAX_LENGTH = 512
BATCH_SIZE = 16

REQUIRED_FILES = ["config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json"]


# ---------------------------------------------------------------------------
# Dependency / model loading
# ---------------------------------------------------------------------------

def _fail(message, install_hint=None):
    print("\nERROR: " + message, file=sys.stderr)
    if install_hint:
        print("\nTo fix, run:\n    " + install_hint, file=sys.stderr)
    sys.exit(1)


def check_model_files():
    if not os.path.isdir(MODEL_PATH):
        _fail(f"Model directory not found: {MODEL_PATH}\n"
              f"This script only reads a model that is already downloaded locally. "
              f"It will not download one.")
    missing = [f for f in REQUIRED_FILES if not os.path.isfile(os.path.join(MODEL_PATH, f))]
    if missing:
        _fail(f"Model directory {MODEL_PATH} is missing required file(s): {', '.join(missing)}\n"
              f"The local model appears incomplete.")


def import_dependencies():
    try:
        import torch  # noqa: F401
    except ImportError:
        _fail("PyTorch is not installed.", "pip install -r requirements.txt")
    try:
        import transformers  # noqa: F401
    except ImportError:
        _fail("Hugging Face Transformers is not installed.", "pip install -r requirements.txt")
    try:
        import pandas  # noqa: F401
    except ImportError:
        _fail("pandas is not installed (needed for --file/results.csv mode).",
              "pip install -r requirements.txt")


def load_model():
    """Load tokenizer + model strictly from local files. Never contacts the network."""
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification

    check_model_files()

    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)
    except Exception as e:
        _fail(f"Failed to load tokenizer from {MODEL_PATH} (local_files_only=True).\n"
              f"Underlying error: {e}")

    try:
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH, local_files_only=True)
    except Exception as e:
        _fail(f"Failed to load model weights from {MODEL_PATH} (local_files_only=True).\n"
              f"Underlying error: {e}")

    model.eval()

    id2label = model.config.id2label
    labels = [id2label[i] for i in range(len(id2label))]
    return tokenizer, model, labels


def detect_device():
    import torch

    cuda_available = torch.cuda.is_available()
    print(f"CUDA available : {cuda_available}")
    if cuda_available:
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem_bytes = torch.cuda.get_device_properties(0).total_memory
        gpu_mem_gb = gpu_mem_bytes / (1024 ** 3)
        print(f"GPU            : {gpu_name}")
        print(f"GPU memory     : {gpu_mem_gb:.2f} GB")
        print("Device used    : cuda:0")
        return torch.device("cuda:0"), gpu_name
    else:
        print("GPU            : none detected")
        print("Device used    : cpu")
        print("NOTE: CUDA is not available in this environment. Running on CPU.")
        return torch.device("cpu"), "CPU"


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def predict(text, tokenizer, model, device, labels):
    """Run one text through tokenizer -> model -> sigmoid. Returns a result dict or
    a dict with an 'error' key if the input is invalid."""
    import torch

    if text is None or not text.strip():
        return {"error": "empty_input"}

    # Detect truncation by comparing the un-truncated token count to MAX_LENGTH.
    full_ids = tokenizer(text, truncation=False)["input_ids"]
    full_len = len(full_ids)
    truncated = full_len > MAX_LENGTH

    inputs = tokenizer(text, truncation=True, max_length=MAX_LENGTH, return_tensors="pt")
    used_tokens = inputs["input_ids"].shape[1]
    inputs = {k: v.to(device) for k, v in inputs.items()}

    start = time.perf_counter()
    with torch.no_grad():
        logits = model(**inputs).logits
    elapsed = time.perf_counter() - start

    probs = torch.sigmoid(logits)[0].detach().cpu().numpy()

    ranked = sorted(zip(labels, probs), key=lambda x: x[1], reverse=True)
    top_label, top_prob = ranked[0]

    return {
        "text": text,
        "ranked": ranked,               # list of (label, prob) sorted desc
        "top_label": top_label,
        "confidence": float(top_prob),
        "elapsed_sec": elapsed,
        "used_tokens": int(used_tokens),
        "full_tokens": int(full_len),
        "truncated": truncated,
    }


def format_result(result, device_label):
    lines = []
    lines.append("INPUT")
    lines.append("-----")
    lines.append(result["text"])
    lines.append("")

    if result["truncated"]:
        lines.append(f"NOTE: Input truncated for the model -- original length {result['full_tokens']} "
                      f"tokens, truncated to {result['used_tokens']} tokens (model max: {MAX_LENGTH}).")
        lines.append("")

    lines.append("EMOTION")
    lines.append("-------")
    lines.append(result["top_label"].title())
    lines.append("")

    lines.append("PROBABILITIES  (independent per-label sigmoid outputs; NOT softmax -- do not expect a sum of 1.0)")
    lines.append("-------------")
    for label, prob in result["ranked"]:
        marker = "  [active >0.5]" if prob > ACTIVE_THRESHOLD else ""
        lines.append(f"{label.title():<12}: {prob:.4f}{marker}")
    lines.append("")

    lines.append("CONFIDENCE (top label's probability)")
    lines.append("----------")
    lines.append(f"{result['confidence']:.4f}")
    lines.append("")

    lines.append("PERFORMANCE")
    lines.append("-----------")
    lines.append(f"Inference time : {result['elapsed_sec']*1000:.1f} ms")
    lines.append(f"Tokens         : {result['used_tokens']}")
    lines.append(f"Device         : {device_label}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Interactive mode
# ---------------------------------------------------------------------------

def run_interactive(tokenizer, model, device, labels, device_label):
    print("=" * 50)
    print("PS 094 -- MULTILINGUAL TEXT EMOTION ANALYZER")
    print("=" * 50)
    print()
    print("Model loaded successfully.")
    print(f"Device: {device_label}")
    print()
    print("This tool classifies EXPRESSED EMOTION only. It does not diagnose")
    print("distress, mental illness, or risk. Type 'exit' or 'quit' to stop.")
    print()

    while True:
        try:
            text = input("Enter text:\n> ")
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if text.strip().lower() in ("exit", "quit"):
            print("Exiting.")
            break

        if not text.strip():
            print("(Empty input ignored -- please enter some text.)\n")
            continue

        result = predict(text, tokenizer, model, device, labels)
        if "error" in result:
            print("(Empty input ignored -- please enter some text.)\n")
            continue

        print()
        print(format_result(result, device_label))
        print()


# ---------------------------------------------------------------------------
# Demo mode (multilingual + PS094 test cases)
# ---------------------------------------------------------------------------

MULTILINGUAL_DEMO = [
    ("ENGLISH", "en", "I am very scared. They are threatening me again."),
    ("HINDI", "hi", "मुझे बहुत डर लग रहा है, वे लोग फिर से धमकी दे रहे हैं।"),
    ("TAMIL", "ta", "எனக்கு மிகவும் பயமாக இருக்கிறது, அவர்கள் மீண்டும் மிரட்டுகிறார்கள்."),
    ("SPANISH", "es", "Estoy muy asustado, me han vuelto a amenazar."),
    ("ARABIC", "ar", "أنا خائف جدًا، لقد هددوني مرة أخرى."),
]

PS094_TEST_CASES = [
    ("FEAR", "I am afraid that they will come back."),
    ("SADNESS", "I feel completely hopeless after everything that happened."),
    ("ANGER", "I am extremely angry about what they have done."),
    ("NEUTRAL", "The hearing is scheduled for next Monday."),
    ("MIXED EMOTIONS", "I am relieved that the case is moving forward, but I am still scared of them."),
]

SUPPORTED_LANGUAGES = [
    "English", "Chinese (zh)", "Spanish", "Hindi", "Arabic", "Bengali", "Portuguese",
    "Russian", "Japanese", "German", "Indonesian", "Tamil", "Vietnamese", "Korean",
    "French", "Turkish", "Italian", "Polish", "Ukrainian", "Urdu", "Dutch", "Punjabi", "Swahili",
]


def run_demo(tokenizer, model, device, labels, device_label):
    print("=" * 50)
    print("PS 094 -- DEMO: MULTILINGUAL INPUT TEST")
    print("=" * 50)
    print()
    print("Model card (README.md, local) claims support for 23 languages:")
    print(", ".join(SUPPORTED_LANGUAGES))
    print()
    print("Below we test a subset. Two claims are kept SEPARATE:")
    print("  (a) 'Model supports language according to metadata' -- from the README only.")
    print("  (b) 'Our local test successfully produced a prediction' -- inference ran without error.")
    print("(b) is NOT evidence that the model is accurate for that language -- only that")
    print("tokenization + a forward pass completed locally.")
    print()

    for lang_name, lang_code, text in MULTILINGUAL_DEMO:
        print()
        print("=" * 50)
        print(lang_name)
        print("=" * 50)
        print("Input:")
        print(text)
        print()

        result = predict(text, tokenizer, model, device, labels)
        local_ok = "error" not in result

        print(f"Model supports language according to metadata : Yes (per README.md)")
        print(f"Our local test successfully produced a prediction : {'Yes' if local_ok else 'No'}")
        print()

        if local_ok:
            print("Top emotion:")
            print(result["top_label"].title())
            print()
            print("Probabilities:")
            for label, prob in result["ranked"]:
                marker = "  [active >0.5]" if prob > ACTIVE_THRESHOLD else ""
                print(f"  {label.title():<12}: {prob:.4f}{marker}")

    print()
    print()
    print("=" * 50)
    print("PS 094 -- PS094 USE-CASE TEST CASES")
    print("=" * 50)
    print("For observing pretrained model behavior only -- not used to modify")
    print("or fine-tune the model.")
    print()

    for case_name, text in PS094_TEST_CASES:
        print()
        print("=" * 50)
        print(case_name)
        print("=" * 50)
        print("Input:")
        print(text)
        print()

        result = predict(text, tokenizer, model, device, labels)
        print("Top emotion:")
        print(result["top_label"].title())
        print()
        print("Probabilities:")
        for label, prob in result["ranked"]:
            marker = "  [active >0.5]" if prob > ACTIVE_THRESHOLD else ""
            print(f"  {label.title():<12}: {prob:.4f}{marker}")
        print()
        print(f"Confidence: {result['confidence']:.4f}")


# ---------------------------------------------------------------------------
# Batch mode
# ---------------------------------------------------------------------------

def run_batch(file_path, tokenizer, model, device, labels, device_label):
    import torch
    import pandas as pd

    if not os.path.isfile(file_path):
        _fail(f"Input file not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f.readlines()]
    texts = [t for t in lines if t]

    if not texts:
        _fail(f"Input file {file_path} contains no non-empty lines.")

    print(f"Loaded {len(texts)} text(s) from {file_path}")
    print(f"Device: {device_label}")
    print("Running batch inference...")

    rows = []
    start_total = time.perf_counter()

    for i in range(0, len(texts), BATCH_SIZE):
        chunk = texts[i:i + BATCH_SIZE]
        inputs = tokenizer(chunk, truncation=True, max_length=MAX_LENGTH,
                            padding=True, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            logits = model(**inputs).logits
        probs = torch.sigmoid(logits).detach().cpu().numpy()

        for text, prob_row in zip(chunk, probs):
            ranked = sorted(zip(labels, prob_row), key=lambda x: x[1], reverse=True)
            top_label, top_prob = ranked[0]
            row = {
                "text": text,
                "top_emotion": top_label,
                "confidence": float(top_prob),
            }
            for label, prob in zip(labels, prob_row):
                row[label] = float(prob)
            rows.append(row)

    elapsed_total = time.perf_counter() - start_total
    texts_per_sec = len(texts) / elapsed_total if elapsed_total > 0 else float("inf")

    df = pd.DataFrame(rows, columns=["text", "top_emotion", "confidence"] + labels)
    out_path = os.path.join(os.path.dirname(os.path.abspath(file_path)) or ".", "results.csv")
    df.to_csv(out_path, index=False, encoding="utf-8-sig")

    print()
    print("BATCH SUMMARY")
    print("-------------")
    print(f"Texts processed : {len(texts)}")
    print(f"Total time      : {elapsed_total:.3f} s")
    print(f"Throughput      : {texts_per_sec:.2f} texts/second")
    print(f"Device          : {device_label}")
    print(f"Output written  : {out_path}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="PS094 local multilingual emotion analyzer")
    parser.add_argument("--demo", action="store_true", help="Run multilingual + PS094 demo test suite")
    parser.add_argument("--file", type=str, default=None, help="Path to a text file (one input per line) for batch mode")
    args = parser.parse_args()

    import_dependencies()

    print("Loading model from local files...")
    print(f"Path: {MODEL_PATH}")
    tokenizer, model, labels = load_model()
    print("Model loaded successfully (local_files_only=True; no network access).")
    print(f"Labels ({len(labels)}): {', '.join(labels)}")
    print()

    device, device_label = detect_device()
    model.to(device)
    print()

    if args.file:
        run_batch(args.file, tokenizer, model, device, labels, device_label)
    elif args.demo:
        run_demo(tokenizer, model, device, labels, device_label)
    else:
        run_interactive(tokenizer, model, device, labels, device_label)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(130)
