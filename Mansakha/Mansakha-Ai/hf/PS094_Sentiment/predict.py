"""
Inference script for the PS 094 Sentiment Model.

Loads the trained model from C:\\Users\\yukes\\Downloads\\hf\\PS094_Sentiment_Model
(no retraining). Supports single-text prediction and CSV batch inference.

Single text:
    python predict.py --text "I am very scared and worried."

Batch:
    python predict.py --csv input.csv --out output.csv
    (input.csv must have columns: id,text)
"""

import argparse
import json
import sys

import pandas as pd
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL_DIR = "C:/Users/yukes/Downloads/hf/PS094_Sentiment_Model"
MAX_LENGTH = 128

_model = None
_tokenizer = None
_id2label = None
_device = None


def load_model():
    global _model, _tokenizer, _id2label, _device
    if _model is not None:
        return
    _device = "cuda" if torch.cuda.is_available() else "cpu"
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    _model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR).to(_device)
    _model.eval()
    with open(f"{MODEL_DIR}/label_map.json", encoding="utf-8") as f:
        label_map = json.load(f)
    _id2label = {int(k): v for k, v in label_map["id2label"].items()}


def predict_one(text):
    load_model()
    enc = _tokenizer(text, truncation=True, max_length=MAX_LENGTH, return_tensors="pt").to(_device)
    with torch.no_grad():
        logits = _model(**enc).logits
        probs = torch.softmax(logits, dim=-1).cpu().numpy()[0]
    pred_id = int(probs.argmax())
    result = {
        "text": text,
        "sentiment": _id2label[pred_id],
        "probabilities": {_id2label[i]: float(probs[i]) for i in range(len(probs))},
        "confidence": float(probs[pred_id]),
    }
    return result


def predict_batch(texts):
    load_model()
    results = []
    batch_size = 32
    for i in range(0, len(texts), batch_size):
        chunk = texts[i:i + batch_size]
        enc = _tokenizer(
            chunk, truncation=True, max_length=MAX_LENGTH, padding=True, return_tensors="pt"
        ).to(_device)
        with torch.no_grad():
            logits = _model(**enc).logits
            probs = torch.softmax(logits, dim=-1).cpu().numpy()
        for j, text in enumerate(chunk):
            pred_id = int(probs[j].argmax())
            results.append({
                "text": text,
                "sentiment": _id2label[pred_id],
                "probabilities": {_id2label[k]: float(probs[j][k]) for k in range(probs.shape[1])},
                "confidence": float(probs[j][pred_id]),
            })
    return results


def print_single_result(result):
    print(f"\nSentiment: {result['sentiment']}\n")
    for label, prob in result["probabilities"].items():
        print(f"{label.capitalize():10s}: {prob:.4f}")
    print(f"\nConfidence: {result['confidence']:.4f}")


def main():
    parser = argparse.ArgumentParser(description="PS 094 Sentiment Model inference")
    parser.add_argument("--text", type=str, help="Single text to classify")
    parser.add_argument("--csv", type=str, help="Path to input.csv with columns: id,text")
    parser.add_argument("--out", type=str, default="output.csv", help="Path to write output.csv")
    args = parser.parse_args()

    if not args.text and not args.csv:
        parser.print_help()
        sys.exit(1)

    if args.text:
        result = predict_one(args.text)
        print_single_result(result)

    if args.csv:
        df = pd.read_csv(args.csv, encoding="utf-8-sig")
        if "text" not in df.columns:
            raise ValueError("input CSV must have a 'text' column")
        if "id" not in df.columns:
            df["id"] = range(1, len(df) + 1)

        texts = df["text"].fillna("").astype(str).tolist()
        results = predict_batch(texts)

        out_rows = []
        for row_id, text, res in zip(df["id"].tolist(), texts, results):
            probs = res["probabilities"]
            out_rows.append({
                "id": row_id,
                "text": text,
                "sentiment": res["sentiment"],
                "negative_probability": probs.get("NEGATIVE", 0.0),
                "positive_probability": probs.get("POSITIVE", 0.0),
                "confidence": res["confidence"],
            })
        out_df = pd.DataFrame(out_rows)
        out_df.to_csv(args.out, index=False, encoding="utf-8-sig")
        print(f"\nWrote {len(out_df)} predictions to {args.out}")


if __name__ == "__main__":
    main()
