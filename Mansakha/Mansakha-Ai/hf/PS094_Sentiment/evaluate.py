"""
Final held-out test evaluation for the PS 094 Sentiment Model.

Loads the trained model from C:\\Users\\yukes\\Downloads\\hf\\PS094_Sentiment_Model
(no retraining) and evaluates ONLY on data/test.csv -- the held-out split that was
never used for training or checkpoint selection.

Produces:
  evaluation/classification_report.txt
  evaluation/confusion_matrix.png
  evaluation/metrics.json
  evaluation/per_language_metrics.csv
"""

import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import torch
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from torch.utils.data import DataLoader
from transformers import AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding

MODEL_DIR = "C:/Users/yukes/Downloads/hf/PS094_Sentiment_Model"
DATA_DIR = "C:/Users/yukes/Downloads/hf/PS094_Sentiment/data"
EVAL_DIR = "C:/Users/yukes/Downloads/hf/PS094_Sentiment/evaluation"
MAX_LENGTH = 128
BATCH_SIZE = 32

LANG_NAMES = {
    "as": "Assamese", "bd": "Bodo", "bn": "Bengali", "gu": "Gujarati", "hi": "Hindi",
    "kn": "Kannada", "ml": "Malayalam", "mr": "Marathi", "or": "Odia", "pa": "Punjabi",
    "ta": "Tamil", "te": "Telugu", "ur": "Urdu", "en": "English",
}


class TextDataset(torch.utils.data.Dataset):
    def __init__(self, texts, labels, tokenizer, max_length):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        enc = self.tokenizer(self.texts[idx], truncation=True, max_length=self.max_length)
        enc["labels"] = self.labels[idx]
        return enc


def run_inference(model, tokenizer, texts, labels, device):
    ds = TextDataset(texts, labels, tokenizer, MAX_LENGTH)
    collator = DataCollatorWithPadding(tokenizer=tokenizer)
    loader = DataLoader(ds, batch_size=BATCH_SIZE, shuffle=False, collate_fn=collator)

    all_preds, all_probs, all_labels = [], [], []
    model.eval()
    with torch.no_grad():
        for batch in loader:
            batch_labels = batch.pop("labels")
            batch = {k: v.to(device) for k, v in batch.items()}
            logits = model(**batch).logits
            probs = torch.softmax(logits, dim=-1).cpu().numpy()
            preds = probs.argmax(axis=-1)
            all_preds.extend(preds.tolist())
            all_probs.extend(probs.tolist())
            all_labels.extend(batch_labels.tolist())
    return np.array(all_labels), np.array(all_preds), np.array(all_probs)


def main():
    os.makedirs(EVAL_DIR, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("Device:", device)

    print(f"Loading trained model from {MODEL_DIR} (no retraining)...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR).to(device)
    with open(f"{MODEL_DIR}/label_map.json", encoding="utf-8") as f:
        label_map = json.load(f)
    id2label = {int(k): v for k, v in label_map["id2label"].items()}
    class_names = [id2label[i] for i in sorted(id2label)]

    test_df = pd.read_csv(f"{DATA_DIR}/test.csv", encoding="utf-8-sig")
    print(f"Test samples: {len(test_df)}")

    y_true, y_pred, y_probs = run_inference(
        model, tokenizer, test_df["text"].tolist(), test_df["label"].tolist(), device
    )

    # --- Overall metrics ---
    acc = accuracy_score(y_true, y_pred)
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="macro", zero_division=0
    )
    weighted_p, weighted_r, weighted_f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )
    report_dict = classification_report(
        y_true, y_pred, target_names=class_names, output_dict=True, zero_division=0
    )
    report_text = classification_report(
        y_true, y_pred, target_names=class_names, zero_division=0
    )

    print("\n=== FINAL TEST SET RESULTS (held-out, never used in training) ===")
    print(report_text)
    print(f"Macro F1:    {macro_f1:.4f}")
    print(f"Weighted F1: {weighted_f1:.4f}")
    print(f"Accuracy:    {acc:.4f}")

    with open(f"{EVAL_DIR}/classification_report.txt", "w", encoding="utf-8") as f:
        f.write("PS 094 Sentiment Model -- Held-out Test Set Classification Report\n")
        f.write("=" * 70 + "\n\n")
        f.write(report_text)
        f.write(f"\nMacro F1:    {macro_f1:.4f}\n")
        f.write(f"Weighted F1: {weighted_f1:.4f}\n")
        f.write(f"Accuracy:    {acc:.4f}\n")

    # --- Confusion matrix ---
    cm = confusion_matrix(y_true, y_pred)
    plt.figure(figsize=(5, 4))
    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Blues",
        xticklabels=class_names, yticklabels=class_names,
    )
    plt.xlabel("Predicted")
    plt.ylabel("Actual")
    plt.title("PS 094 Sentiment Model - Confusion Matrix (Test Set)")
    plt.tight_layout()
    plt.savefig(f"{EVAL_DIR}/confusion_matrix.png", dpi=150)
    plt.close()
    print(f"\nConfusion matrix saved to {EVAL_DIR}/confusion_matrix.png")
    print("Confusion matrix (rows=actual, cols=predicted):")
    print(f"           Pred {class_names[0]:>10s}  Pred {class_names[1]:>10s}")
    for i, name in enumerate(class_names):
        print(f"Actual {name:10s}  {cm[i][0]:14d}  {cm[i][1]:14d}")

    # --- Per-language metrics ---
    print("\n=== PER-LANGUAGE TEST RESULTS ===")
    lang_rows = []
    test_df = test_df.reset_index(drop=True)
    for lang in sorted(test_df["language"].unique(), key=lambda l: (l != "en", l)):
        mask = (test_df["language"] == lang).values
        if mask.sum() == 0:
            continue
        lt, lp = y_true[mask], y_pred[mask]
        lang_acc = accuracy_score(lt, lp)
        _, _, lang_macro_f1, _ = precision_recall_fscore_support(
            lt, lp, average="macro", zero_division=0
        )
        lang_weighted_f1 = f1_score(lt, lp, average="weighted", zero_division=0)
        lang_rows.append({
            "language_code": lang,
            "language": LANG_NAMES.get(lang, lang),
            "n_samples": int(mask.sum()),
            "accuracy": lang_acc,
            "macro_f1": lang_macro_f1,
            "weighted_f1": lang_weighted_f1,
        })

    lang_df = pd.DataFrame(lang_rows).sort_values("language")
    lang_df.to_csv(f"{EVAL_DIR}/per_language_metrics.csv", index=False)

    header = f"{'Language':12s} | {'N':>5s} | {'Accuracy':>9s} | {'Macro F1':>9s} | {'Weighted F1':>11s}"
    print(header)
    print("-" * len(header))
    for _, row in lang_df.iterrows():
        print(f"{row['language']:12s} | {row['n_samples']:5d} | {row['accuracy']:9.4f} | "
              f"{row['macro_f1']:9.4f} | {row['weighted_f1']:11.4f}")

    # --- Save metrics.json ---
    metrics = {
        "test_samples": len(test_df),
        "accuracy": acc,
        "macro_precision": macro_p,
        "macro_recall": macro_r,
        "macro_f1": macro_f1,
        "weighted_precision": weighted_p,
        "weighted_recall": weighted_r,
        "weighted_f1": weighted_f1,
        "per_class": report_dict,
        "per_language": lang_rows,
    }
    with open(f"{EVAL_DIR}/metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False)
    print(f"\nSaved metrics.json, classification_report.txt, per_language_metrics.csv to {EVAL_DIR}")


if __name__ == "__main__":
    main()
