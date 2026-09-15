"""
Data preparation for PS 094 Sentiment Model (Model #1).

Source: local AI4Bharat IndicSentiment dataset
  C:\\Users\\yukes\\Downloads\\hf\\IndicSentiment\\data\\{validation,test}\\{lang}.json

Key facts established by inspection (see console output / report):
  - 13 Indic language files per split: as, bd, bn, gu, hi, kn, ml, mr, or, pa, ta, te, ur
  - Only two official splits exist: validation (156 reviews/lang) and test (1000 reviews/lang).
    There is NO official train split.
  - Row i of every language file within a split is a translation of the SAME underlying
    English review (verified: ENGLISH REVIEW and LABEL match across languages at same row).
  - LABEL is binary: "Positive" / "Negative" only. There is NO Neutral class in this dataset.
    A small number of rows (26, all in test) have LABEL == None (malformed) and are dropped.
  - English itself is also included as its own "language" (from the ENGLISH REVIEW field),
    deduplicated per review group so it isn't counted 13x.

Because there's no train split, we pool validation+test's ~1156 unique underlying reviews
and regroup 70/10/20 into train/val/test, grouping by (split, row_index) so every language's
translation of the same review stays entirely inside one new split -> no cross-lingual leakage.
"""

import json
import os
import random
import unicodedata
from collections import Counter, defaultdict

import pandas as pd

DATA_ROOT = "C:/Users/yukes/Downloads/hf/IndicSentiment/data"
OUT_DIR = "C:/Users/yukes/Downloads/hf/PS094_Sentiment/data"
os.makedirs(OUT_DIR, exist_ok=True)

LANGS = ["as", "bd", "bn", "gu", "hi", "kn", "ml", "mr", "or", "pa", "ta", "te", "ur"]
LANG_NAMES = {
    "as": "Assamese", "bd": "Bodo", "bn": "Bengali", "gu": "Gujarati", "hi": "Hindi",
    "kn": "Kannada", "ml": "Malayalam", "mr": "Marathi", "or": "Odia", "pa": "Punjabi",
    "ta": "Tamil", "te": "Telugu", "ur": "Urdu", "en": "English",
}
LABEL_MAP = {"Negative": 0, "Positive": 1}
ID2LABEL = {0: "NEGATIVE", 1: "POSITIVE"}
SEED = 42

random.seed(SEED)


def clean_text(t):
    """Normalize unicode, strip surrounding whitespace. Preserve scripts, emojis, punctuation."""
    if t is None:
        return None
    t = unicodedata.normalize("NFC", str(t))
    t = t.strip()
    t = " ".join(t.split())  # collapse internal whitespace/newlines, keep all characters
    return t


def load_raw():
    """Load every (split, lang) json file. Returns list of raw dict rows with row_index."""
    raw = []
    for split in ["validation", "test"]:
        for lang in LANGS:
            path = f"{DATA_ROOT}/{split}/{lang}.json"
            with open(path, encoding="utf-8") as f:
                for row_idx, line in enumerate(f):
                    d = json.loads(line)
                    raw.append({
                        "orig_split": split,
                        "lang": lang,
                        "row_index": row_idx,
                        "group_id": f"{split}_{row_idx}",
                        "english_review": d.get("ENGLISH REVIEW"),
                        "indic_review": d.get("INDIC REVIEW"),
                        "label_raw": d.get("LABEL"),
                        "category": d.get("CATEGORY"),
                    })
    return raw


def build_records(raw):
    """Turn raw rows into (group_id, lang, text, label) records, incl. deduped English."""
    records = []
    missing_label = 0
    missing_text = 0
    seen_en_groups = set()

    for r in raw:
        label_raw = r["label_raw"]
        if label_raw not in LABEL_MAP:
            missing_label += 1
            continue

        # Indic-language record
        text = clean_text(r["indic_review"])
        if not text:
            missing_text += 1
        else:
            records.append({
                "group_id": r["group_id"],
                "language": r["lang"],
                "text": text,
                "label": LABEL_MAP[label_raw],
            })

        # English record (deduplicated per group_id, since it's repeated across all 13 files)
        if r["group_id"] not in seen_en_groups:
            en_text = clean_text(r["english_review"])
            if en_text:
                records.append({
                    "group_id": r["group_id"],
                    "language": "en",
                    "text": en_text,
                    "label": LABEL_MAP[label_raw],
                })
            seen_en_groups.add(r["group_id"])

    print(f"Dropped rows with missing/invalid LABEL: {missing_label}")
    print(f"Dropped rows with missing/empty text:   {missing_text}")
    return records, missing_label, missing_text


def dedup(records):
    """Drop exact duplicate (language, text, label) rows."""
    df = pd.DataFrame(records)
    before = len(df)
    df = df.drop_duplicates(subset=["language", "text", "label"]).reset_index(drop=True)
    after = len(df)
    print(f"Exact duplicate rows removed: {before - after}")
    return df


def summarize(df, title):
    print(f"\n=== {title} ===")
    print(f"Total rows: {len(df)}")
    print(f"Unique review groups: {df['group_id'].nunique()}")

    print("\nLanguage distribution:")
    lang_counts = df["language"].value_counts()
    for lang, cnt in lang_counts.items():
        print(f"  {LANG_NAMES.get(lang, lang):12s} ({lang}): {cnt}")

    print("\nLabel distribution:")
    label_counts = df["label"].value_counts()
    for lbl, cnt in label_counts.items():
        pct = 100 * cnt / len(df)
        print(f"  {ID2LABEL[lbl]:10s}: {cnt} ({pct:.1f}%)")


def split_by_group(df, train_frac=0.7, val_frac=0.1, test_frac=0.2):
    """Stratified group split: assign whole review-groups to train/val/test by group's
    majority label, so label balance is preserved across splits while keeping every
    language-translation of a review inside a single split (no leakage)."""
    assert abs(train_frac + val_frac + test_frac - 1.0) < 1e-9

    group_label = df.groupby("group_id")["label"].agg(lambda s: s.mode().iloc[0])
    groups_by_label = defaultdict(list)
    for gid, lbl in group_label.items():
        groups_by_label[lbl].append(gid)

    rng = random.Random(SEED)
    train_groups, val_groups, test_groups = set(), set(), set()
    for lbl, gids in groups_by_label.items():
        gids = sorted(gids)  # deterministic order before shuffling
        rng.shuffle(gids)
        n = len(gids)
        n_train = int(round(n * train_frac))
        n_val = int(round(n * val_frac))
        train_groups.update(gids[:n_train])
        val_groups.update(gids[n_train:n_train + n_val])
        test_groups.update(gids[n_train + n_val:])

    assert train_groups.isdisjoint(val_groups)
    assert train_groups.isdisjoint(test_groups)
    assert val_groups.isdisjoint(test_groups)

    train_df = df[df["group_id"].isin(train_groups)].reset_index(drop=True)
    val_df = df[df["group_id"].isin(val_groups)].reset_index(drop=True)
    test_df = df[df["group_id"].isin(test_groups)].reset_index(drop=True)
    return train_df, val_df, test_df


def main():
    print("Loading raw dataset files...")
    raw = load_raw()
    print(f"Total raw rows loaded (all languages, both official splits): {len(raw)}")

    print("\nBuilding cleaned records (Indic + deduplicated English)...")
    records, n_missing_label, n_missing_text = build_records(raw)
    df = dedup(records)

    summarize(df, "FULL POOLED DATASET (validation+test merged, pre-resplit)")

    print("\nSplitting into train/val/test (70/10/20) by review-group, stratified by label...")
    train_df, val_df, test_df = split_by_group(df)

    summarize(train_df, "TRAIN SPLIT")
    summarize(val_df, "VALIDATION SPLIT")
    summarize(test_df, "TEST SPLIT")

    # Per-language x split table
    print("\n=== Language x Split sample counts ===")
    all_langs = sorted(df["language"].unique(), key=lambda l: (l != "en", l))
    header = f"{'Language':12s} | {'Train':>7s} | {'Val':>7s} | {'Test':>7s} | {'Total':>7s}"
    print(header)
    print("-" * len(header))
    for lang in all_langs:
        tr = (train_df["language"] == lang).sum()
        va = (val_df["language"] == lang).sum()
        te = (test_df["language"] == lang).sum()
        print(f"{LANG_NAMES.get(lang, lang):12s} | {tr:7d} | {va:7d} | {te:7d} | {tr+va+te:7d}")

    # Save
    train_df.to_csv(f"{OUT_DIR}/train.csv", index=False, encoding="utf-8-sig")
    val_df.to_csv(f"{OUT_DIR}/val.csv", index=False, encoding="utf-8-sig")
    test_df.to_csv(f"{OUT_DIR}/test.csv", index=False, encoding="utf-8-sig")

    with open(f"{OUT_DIR}/label_map.json", "w", encoding="utf-8") as f:
        json.dump({"label2id": LABEL_MAP, "id2label": ID2LABEL}, f, indent=2)

    print(f"\nSaved train.csv ({len(train_df)}), val.csv ({len(val_df)}), "
          f"test.csv ({len(test_df)}) to {OUT_DIR}")


if __name__ == "__main__":
    main()
