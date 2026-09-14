"""
Train Model #1: Multilingual Sentiment Analysis for PS 094.

Fine-tunes local IndicBERTv2 on the local IndicSentiment dataset (binary:
NEGATIVE / POSITIVE -- see data_prep.py for why there is no NEUTRAL class).

Usage:
    python train.py
"""

import json
import os
import random
import time

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support
from torch.utils.data import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    Trainer,
    TrainerCallback,
    TrainingArguments,
    set_seed,
)

BASE_MODEL_PATH = "C:/Users/yukes/Downloads/hf/IndicBERTv2"
DATA_DIR = "C:/Users/yukes/Downloads/hf/PS094_Sentiment/data"
CHECKPOINT_DIR = "C:/Users/yukes/Downloads/hf/PS094_Sentiment/models/checkpoints"
FINAL_MODEL_DIR = "C:/Users/yukes/Downloads/hf/PS094_Sentiment_Model"

SEED = 42
MAX_LENGTH = 128
BATCH_SIZE = 8
GRAD_ACCUM = 4  # effective batch size 32
NUM_EPOCHS = 3
LEARNING_RATE = 2e-5

ID2LABEL = {0: "NEGATIVE", 1: "POSITIVE"}
LABEL2ID = {"NEGATIVE": 0, "POSITIVE": 1}


def set_all_seeds(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    set_seed(seed)


class SentimentDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_length):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        enc = self.tokenizer(
            self.texts[idx],
            truncation=True,
            max_length=self.max_length,
        )
        enc["labels"] = self.labels[idx]
        return enc


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=1)
    acc = accuracy_score(labels, preds)
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(
        labels, preds, average="macro", zero_division=0
    )
    weighted_f1 = f1_score(labels, preds, average="weighted", zero_division=0)
    return {
        "accuracy": acc,
        "macro_f1": macro_f1,
        "macro_precision": macro_p,
        "macro_recall": macro_r,
        "weighted_f1": weighted_f1,
    }


class WeightedLossTrainer(Trainer):
    """CrossEntropyLoss with class weights (near-1.0 here since the dataset is ~50/50,
    but computed and applied for correctness rather than assumed)."""

    def __init__(self, class_weights=None, **kwargs):
        super().__init__(**kwargs)
        self.class_weights = class_weights

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits
        weight = self.class_weights.to(logits.device) if self.class_weights is not None else None
        loss_fct = torch.nn.CrossEntropyLoss(weight=weight)
        loss = loss_fct(logits.view(-1, logits.shape[-1]), labels.view(-1))
        return (loss, outputs) if return_outputs else loss


class EpochReportCallback(TrainerCallback):
    """Prints the exact per-epoch block requested in the spec."""

    def __init__(self):
        self.train_loss_running = None

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs is not None and "loss" in logs:
            self.train_loss_running = logs["loss"]

    def on_evaluate(self, args, state, control, metrics=None, **kwargs):
        if metrics is None:
            return
        epoch = metrics.get("epoch", state.epoch)
        print(f"\nEpoch {epoch:.0f}/{int(args.num_train_epochs)}")
        print(f"Training Loss: {self.train_loss_running}")
        print(f"Validation Loss: {metrics.get('eval_loss'):.4f}")
        print(f"Validation Accuracy: {metrics.get('eval_accuracy'):.4f}")
        print(f"Validation Macro F1: {metrics.get('eval_macro_f1'):.4f}")
        print(f"Validation Weighted F1: {metrics.get('eval_weighted_f1'):.4f}")


def main():
    set_all_seeds(SEED)

    assert torch.cuda.is_available(), "CUDA is required for training but is not available."
    print("GPU:", torch.cuda.get_device_name(0))
    print(f"GPU memory free/total (MB): "
          f"{(torch.cuda.get_device_properties(0).total_memory - torch.cuda.memory_reserved(0)) / 1e6:.0f} / "
          f"{torch.cuda.get_device_properties(0).total_memory / 1e6:.0f}")

    print("\nLoading data...")
    train_df = pd.read_csv(f"{DATA_DIR}/train.csv", encoding="utf-8-sig")
    val_df = pd.read_csv(f"{DATA_DIR}/val.csv", encoding="utf-8-sig")
    print(f"Train: {len(train_df)}  Val: {len(val_df)}")

    print("\nLoading tokenizer and model from local IndicBERTv2...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_PATH)
    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL_PATH,
        num_labels=2,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )

    # --- Memory strategy for RTX 2050 (4GB VRAM) ---
    # IndicBERTv2's word-embedding matrix alone is 250,000 x 768 = 192M params (~69% of the
    # model's 278M total). Fine-tuning it with AdamW (2 optimizer states/param) plus gradients
    # in fp32 would require >2GB just for that one layer's training state, which does not fit
    # alongside activations on a 4GB card. We freeze the embedding layer (it's already a
    # well-trained multilingual representation) and fine-tune all 12 encoder layers + the
    # classification head (~86M trainable params). This is a standard, well-justified strategy
    # for fine-tuning large-vocabulary multilingual encoders on constrained GPUs.
    n_total = sum(p.numel() for p in model.parameters())
    for param in model.bert.embeddings.parameters():
        param.requires_grad = False
    n_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\nTotal parameters: {n_total:,}")
    print(f"Trainable parameters (embeddings frozen): {n_trainable:,} "
          f"({100 * n_trainable / n_total:.1f}%)")

    train_ds = SentimentDataset(
        train_df["text"].tolist(), train_df["label"].tolist(), tokenizer, MAX_LENGTH
    )
    val_ds = SentimentDataset(
        val_df["text"].tolist(), val_df["label"].tolist(), tokenizer, MAX_LENGTH
    )
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    # Class weights (dataset is ~50/50, so these are near 1.0 -- computed, not assumed)
    label_counts = train_df["label"].value_counts().sort_index()
    n_samples = len(train_df)
    n_classes = 2
    class_weights = torch.tensor(
        [n_samples / (n_classes * label_counts[i]) for i in range(n_classes)],
        dtype=torch.float,
    )
    print(f"Class weights [NEGATIVE, POSITIVE]: {class_weights.tolist()}")

    total_steps = (len(train_ds) // (BATCH_SIZE * GRAD_ACCUM)) * NUM_EPOCHS
    warmup_steps = max(1, int(0.06 * total_steps))

    training_args = TrainingArguments(
        output_dir=CHECKPOINT_DIR,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE * 2,
        gradient_accumulation_steps=GRAD_ACCUM,
        num_train_epochs=NUM_EPOCHS,
        learning_rate=LEARNING_RATE,
        weight_decay=0.01,
        warmup_steps=warmup_steps,
        lr_scheduler_type="linear",
        fp16=True,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        logging_strategy="steps",
        logging_steps=25,
        seed=SEED,
        data_seed=SEED,
        report_to="none",
        dataloader_num_workers=0,
        dataloader_pin_memory=True,
        max_grad_norm=1.0,
    )

    trainer = WeightedLossTrainer(
        class_weights=class_weights,
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2), EpochReportCallback()],
    )

    print("\nStarting training...")
    start_time = time.time()
    train_result = trainer.train()
    elapsed = time.time() - start_time
    print(f"\nTraining complete in {elapsed / 60:.1f} minutes.")
    print(f"Peak GPU memory allocated: {torch.cuda.max_memory_allocated() / 1e6:.0f} MB")

    print("\nBest checkpoint metric (macro_f1):", trainer.state.best_metric)

    print(f"\nSaving best model to {FINAL_MODEL_DIR} ...")
    os.makedirs(FINAL_MODEL_DIR, exist_ok=True)
    trainer.save_model(FINAL_MODEL_DIR)
    tokenizer.save_pretrained(FINAL_MODEL_DIR)
    with open(f"{FINAL_MODEL_DIR}/label_map.json", "w", encoding="utf-8") as f:
        json.dump({"label2id": LABEL2ID, "id2label": ID2LABEL}, f, indent=2)

    training_meta = {
        "base_model": "IndicBERTv2 (local)",
        "dataset": "AI4Bharat IndicSentiment (local)",
        "train_samples": len(train_df),
        "val_samples": len(val_df),
        "epochs": NUM_EPOCHS,
        "batch_size": BATCH_SIZE,
        "gradient_accumulation_steps": GRAD_ACCUM,
        "effective_batch_size": BATCH_SIZE * GRAD_ACCUM,
        "learning_rate": LEARNING_RATE,
        "max_length": MAX_LENGTH,
        "seed": SEED,
        "gpu": torch.cuda.get_device_name(0),
        "training_time_minutes": elapsed / 60,
        "best_val_macro_f1": trainer.state.best_metric,
        "peak_gpu_memory_mb": torch.cuda.max_memory_allocated() / 1e6,
        "frozen_layers": "bert.embeddings",
        "trainable_parameters": n_trainable,
        "total_parameters": n_total,
    }
    with open(f"{FINAL_MODEL_DIR}/training_meta.json", "w", encoding="utf-8") as f:
        json.dump(training_meta, f, indent=2)

    print("\nDone. Model saved to:", FINAL_MODEL_DIR)
    print(json.dumps(training_meta, indent=2))


if __name__ == "__main__":
    main()
