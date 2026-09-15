# PS 094 — Model #1: Multilingual Sentiment Analysis

Fine-tunes local **IndicBERTv2** on the local **AI4Bharat IndicSentiment** dataset for
sentiment classification of product reviews across English + 13 Indic languages.

This is **not** the distress model. It is one component that will later feed into the
PS 094 distress-analysis pipeline.

## Important deviations from a generic 3-class spec (verified by inspection, not assumed)

1. **Binary labels, not 3-class.** IndicSentiment's `LABEL` field only ever contains
   `Positive` / `Negative` (verified across all 13 language files, both splits). There is
   no Neutral class in this dataset, so the model outputs `NEGATIVE` / `POSITIVE` only —
   a Neutral class was not fabricated.
2. **No official train split.** AI4Bharat ships only `validation` (156 reviews/language)
   and `test` (1000 reviews/language) — no `train`. See `data_prep.py` for how train/val/test
   were rebuilt: the ~1152 unique underlying English reviews (validation+test pooled) were
   split 70/10/20 by review group (not by row), so every language's translation of a given
   review stays entirely inside one split — no cross-lingual leakage.
3. **English included as a 14th "language"** using the dataset's own `ENGLISH REVIEW`
   field (deduplicated), since it's a first-class part of this multilingual benchmark and
   the task calls for testing English too.

## Dataset

- Source: `C:\Users\yukes\Downloads\hf\IndicSentiment` (local, not re-downloaded)
- Languages: English (en), Assamese (as), Bodo (bd), Bengali (bn), Gujarati (gu), Hindi (hi),
  Kannada (kn), Malayalam (ml), Marathi (mr), Odia (or), Punjabi (pa), Tamil (ta),
  Telugu (te), Urdu (ur)
- 1152 unique reviews x 14 languages ≈ 16.1k labeled rows after cleaning (26 malformed/null
  labels dropped, 30 exact duplicates dropped)
- Near-perfectly balanced: ~50.3% Positive / 49.7% Negative, and ~1152 rows/language
  (no language dominates)

## Base model

- Source: `C:\Users\yukes\Downloads\hf\IndicBERTv2` (local, not re-downloaded)
- `ai4bharat/IndicBERTv2-MLM-only`, BERT-base architecture, 278M parameters
  (250k vocab, hidden size 768, 12 layers, 12 heads)
- Shipped as `pytorch_model.bin` only; converted once to `model.safetensors` in place so it
  loads under current `transformers`' safe-loading policy (see `data_prep.py`/console log
  for details) — no weights were changed, only the serialization format.

## GPU / memory strategy

- NVIDIA RTX 2050, 4GB VRAM. PyTorch was reinstalled as the CUDA 12.1 build
  (`torch==2.5.1+cu121`) — the environment originally had a CPU-only `torch` wheel.
- IndicBERTv2's word-embedding table alone is 250,000 x 768 ≈ 192M params (~69% of the
  model). Fine-tuning it with AdamW would not fit in 4GB alongside activations, so the
  embedding layer is **frozen**; the 12 encoder layers + classification head (~86M params,
  ~31% of the model) are fine-tuned. Mixed precision (fp16) is enabled. Effective batch
  size is 32 (`batch_size=8 x gradient_accumulation_steps=4`).

## Project layout

```
PS094_Sentiment/
├── data_prep.py          # inspects & rebuilds train/val/test from the raw dataset
├── train.py               # fine-tunes IndicBERTv2 -> models/ and PS094_Sentiment_Model/
├── evaluate.py             # final held-out test evaluation + confusion matrix
├── predict.py              # single-text and CSV batch inference
├── requirements.txt
├── data/                   # train.csv / val.csv / test.csv / label_map.json
├── models/checkpoints/     # intermediate Trainer checkpoints
└── evaluation/
    ├── confusion_matrix.png
    ├── classification_report.txt
    ├── per_language_metrics.csv
    └── metrics.json
```

The trained model itself is saved to:
`C:\Users\yukes\Downloads\hf\PS094_Sentiment_Model` (directly loadable with
`AutoModelForSequenceClassification.from_pretrained(...)`).

## Usage

```bash
# 1. Rebuild train/val/test CSVs from the raw dataset (prints full dataset summary)
python data_prep.py

# 2. Fine-tune (requires CUDA)
python train.py

# 3. Evaluate ONLY on the held-out test set (no retraining)
python evaluate.py

# 4. Single-text inference
python predict.py --text "I am very scared and worried."

# 5. Batch inference
python predict.py --csv input.csv --out output.csv
```

## Results (actual, measured on the held-out test set — never seen during training)

- Train / Val / Test: 11,282 / 1,610 / 3,234 rows (806 / 115 / 231 unique reviews x 14 languages)
- Training time: 10.6 minutes on RTX 2050 (3 epochs, peak VRAM 2.82GB)
- Best validation Macro F1: 0.9652 (epoch 3, selected checkpoint)

**Test set:**

| Metric | Value |
|---|---|
| Accuracy | 0.9403 |
| Macro F1 | 0.9403 |
| Weighted F1 | 0.9403 |
| Precision (NEGATIVE / POSITIVE) | 0.93 / 0.95 |
| Recall (NEGATIVE / POSITIVE) | 0.95 / 0.93 |

**Per-language accuracy** (231 samples/language): ranges from 0.9654 (Malayalam) down to
0.8615 (Bodo) — every other language scores 0.93–0.97. Bodo is the one clear weak point:
it's a low-resource language (ISO `brx`) and IndicBERTv2's own pretraining data for it is
much smaller than for the other 12 Indic languages, so this gap is expected and should be
kept in mind if Bodo inputs reach the downstream PS 094 pipeline.

See `evaluation/metrics.json`, `evaluation/classification_report.txt`,
`evaluation/per_language_metrics.csv`, and `evaluation/confusion_matrix.png` for full detail.

**Known limitation:** because the model is binary (no Neutral class exists in the training
data), a genuinely neutral/mixed input does not get a distinct label — it gets forced to
whichever side edges out, often near 50/50 confidence (e.g. "இந்த உணவகம் சராசரியாக இருந்தது"
/ "this restaurant was average" -> POSITIVE at 54.1% vs 45.9%). Low-confidence binary
predictions like this are a practical proxy for "neutral" if the downstream pipeline needs
one, but they are not a true third class.
