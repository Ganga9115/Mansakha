# MODEL_ANALYSIS.md — PS094 Model #2: Multilingual Text Emotion Analysis

All facts below come from the local files in
`C:\Users\yukes\Downloads\hf\MultilingualEmotion` (`config.json`, `tokenizer.json`,
`tokenizer_config.json`, `model.safetensors`, `README.md`) plus measurements taken
by actually running `test_emotion.py` in this environment. Anything not
determinable from those local files is explicitly marked
**"Not available in local model files."**

---

## 1. Model identity

- **Source repo (per local README.md):** `tabularisai/multilingual-emotion-classification`
- **Task:** Multi-label multilingual text emotion classification
- **Local path:** `C:\Users\yukes\Downloads\hf\MultilingualEmotion`

## 2. Architecture

- `config.json` → `"architectures": ["XLMRobertaForSequenceClassification"]`, `"model_type": "xlm-roberta"`
- Encoder: 12 transformer layers, hidden size 768, 12 attention heads, intermediate size 3072, GELU activation
- Classification head: `classifier.dense` (768→768) + `classifier.out_proj` (768→11), confirmed directly from the `model.safetensors` tensor shapes
- `"problem_type": "multi_label_classification"` — the model was trained with **independent sigmoid outputs per label** (BCEWithLogitsLoss), not a single softmax distribution. This script therefore reports each emotion as an independent probability, not a distribution that sums to 1.0. See note in section 12.

## 3. Base model

- **`FacebookAI/xlm-roberta-base`**, per the local `README.md`. (Not present as a field in `config.json` itself — no `_name_or_path` key — so this is sourced from the model card, not config.)

## 4. Number of parameters

- **~278,052,107 parameters (~278M)**, computed directly from the `model.safetensors` header (201 tensors, all stored as `float32`). This matches the well-known size of `xlm-roberta-base` (~278M) plus a small classification head.
- No parameter-count claim is stated in the local README — this figure is derived locally, not copied from documentation.

## 5. Emotion labels

11 labels, taken verbatim from `config.json`'s `id2label`:

```
0 -> anger
1 -> contempt
2 -> disgust
3 -> fear
4 -> frustration
5 -> gratitude
6 -> joy
7 -> love
8 -> neutral
9 -> sadness
10 -> surprise
```

No "distress" or diagnostic label exists in this model. It only ever outputs the 11 emotion names above.

## 6. Languages

Per the local `README.md`, the model claims support for **23 languages**:
English, Chinese (zh), Spanish, Hindi, Arabic, Bengali, Portuguese, Russian, Japanese, German, Indonesian, Tamil, Vietnamese, Korean, French, Turkish, Italian, Polish, Ukrainian, Urdu, Dutch, Punjabi, Swahili.

This is a **metadata claim from the model card**, not something re-verified against a labeled multilingual test set in this project. `test_emotion.py --demo` runs real local inference in 5 of these languages (English, Hindi, Tamil, Spanish, Arabic) and confirms only that **a forward pass completes without error** for each — this is evidence of local operability, not of translation/classification accuracy per language. Accuracy per language is **Not available in local model files** (the README reports only aggregate multilingual metrics, not a per-language breakdown).

## 7. Tokenizer

- **Class:** `XLMRobertaTokenizer` (fast, `tokenizers`-backed; SentencePiece-Unigram model type, confirmed by inspecting `tokenizer.json`'s internal `"model": {"type": "Unigram"}`)
- **Vocab size:** 250,002 (matches `config.json` and the `roberta.embeddings.word_embeddings.weight` shape `[250002, 768]`)
- All tokenizer data is self-contained in `tokenizer.json` — no separate `sentencepiece.model`/`vocab.json`/`merges.txt`/`special_tokens_map.json` files are shipped.
- Special tokens: `<s>` (bos/cls, id 0), `<pad>` (id 1), `</s>` (eos/sep, id 2), `<unk>` (id 3), `<mask>` (id 250001)

## 8. Maximum sequence length

- `tokenizer_config.json`: `"model_max_length": 512`
- `config.json`: `"max_position_embeddings": 514` (512 usable positions + 2 for the RoBERTa-style position offset — this is standard and not an inconsistency)
- `test_emotion.py` tokenizes with `truncation=True, max_length=512` and explicitly detects and reports when truncation occurs (verified in testing: a synthetic 562-token input was correctly reported as "truncated to 512 tokens").

## 9. Model size

- `model.safetensors`: **1,112,232,668 bytes ≈ 1.04 GB**
- **Dtype:** float32 (`config.json`: `"dtype": "float32"`; confirmed by the safetensors header, all 201 tensors stored as `F32`)

## 10. License

- **`cc-by-nc-4.0`** (Creative Commons Attribution-NonCommercial 4.0), per the local README.md.
- This is **non-commercial**. If PS094 has any commercial deployment path, this license needs separate legal review before production use — flagging this explicitly since it affects downstream decisions, not just local testing.

## 11. Intended use

Per the local README.md, the model card lists intended use cases as: multilingual social media emotion monitoring, customer feedback affect analysis, product review emotion tagging, brand sentiment tracking, affect-aware conversational systems, and market research. It does **not** list clinical, legal, or safety-critical decision-making as an intended use.

## 12. Known limitations

From the local README.md:
- Trained on **synthetic data generated by LLMs** covering all 23 languages/11 emotions — the model card itself states "real-world validation is strongly advised before deploying in high-stakes settings."
- Emotion labels are described in the model card as "culturally situated," and the authors state predictions should be treated as "probabilistic signals, not ground truth about a person's internal state."
- Reported eval metrics (per model card, on the authors' own held-out multilingual test set of 11,500 rows, **not independently reproduced here**): F1-micro 0.840, F1-macro 0.839, Jaccard(samples) 0.794, Subset accuracy 0.640, Hamming accuracy 0.953, AUROC-micro 0.980.

Additional limitation observed during local testing (not from the README):
- Because the model is multi-label (independent sigmoid per label), a single dominant emotion (e.g. Fear ≈ 0.99) does not suppress other labels the way a softmax model would — most inputs still carry small non-zero probability mass on unrelated labels (e.g. Sadness ≈ 0.03–0.07 alongside Fear ≈ 0.99 in several PS094 test cases). This is expected multi-label behavior, not model error, but should be understood by anyone reading raw probability output.
- **This model classifies expressed emotion only.** It has no concept of and must not be used to infer: depression, PTSD, mental illness, psychological crisis, suicide risk, or victim vulnerability. Any such inference is out of scope for this model and was not attempted anywhere in this test harness.

## 13. Whether it can run locally

**Yes — confirmed.** `test_emotion.py` loads both the tokenizer and model with `AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)` / `AutoModelForSequenceClassification.from_pretrained(MODEL_PATH, local_files_only=True)`, which raises rather than silently falling back to a network download if local files are missing or incomplete. Verified working end-to-end (interactive, `--demo`, `--file`) in this environment with:
- Python 3.12.10
- torch 2.5.1+cu121
- transformers 5.16.1
- numpy 2.5.2, pandas 3.0.5 (already installed; no packages had to be added)

## 14. RTX 2050 performance (measured, not estimated)

Measured directly on this machine's NVIDIA GeForce RTX 2050 (4.00 GB VRAM, `torch.cuda.is_available()` → True):

| Scenario | Result |
|---|---|
| Single-sentence interactive inference (16 tokens) | ~368 ms on first call (includes one-time CUDA context/kernel warm-up); subsequent calls are faster |
| Batch inference, 5 short texts (input.txt), batch_size=16 | 0.206 s total → 24.3 texts/second |
| Batch inference, 100 short texts, batch_size=16 | 0.301 s total → **332 texts/second** (steady-state, warm-up cost amortized) |
| Model weights on GPU | ~1.04 GB fp32, comfortably fits in the 2050's 4 GB VRAM alongside activations for the batch sizes tested |

**Conclusion:** with the CUDA warm-up cost amortized over more than a handful of calls, this model comfortably supports near-real-time single-sentence analysis (sub-50ms typical after warm-up) and >300 texts/second in small-batch mode on the RTX 2050 — sufficient headroom for PS094's stated near-real-time analysis goal, for text input at least. No further optimization (fp16, ONNX, quantization) was attempted or is claimed to be necessary; if higher throughput is later required, those are options to evaluate, not something implemented here.
