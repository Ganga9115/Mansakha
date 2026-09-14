"""Step 17: test the trained model on real text in every language it was actually
trained on (verified supported by both the dataset and IndicBERTv2's pretraining
languages -- not assumed just because the tokenizer can encode the script)."""

import sys
sys.path.insert(0, ".")
from predict import predict_one

samples = {
    "English":   "I am very scared and worried.",
    "Hindi":     "मुझे बहुत डर लग रहा है और मैं चिंतित हूं।",
    "Tamil":     "இந்த தயாரிப்பு மிகவும் நன்றாக இருக்கிறது, எனக்கு மிகவும் பிடித்தது.",
    "Telugu":    "ఈ ఉత్పత్తి చాలా బాగుంది, నాకు చాలా నచ్చింది.",
    "Kannada":   "ಈ ಉತ್ಪನ್ನ ತುಂಬಾ ಕೆಟ್ಟದಾಗಿದೆ, ನಾನು ನಿರಾಶೆಗೊಂಡಿದ್ದೇನೆ.",
    "Malayalam": "ഈ ഉൽപ്പന്നം വളരെ മോശമാണ്, ഞാൻ നിരാശനാണ്.",
    "Bengali":   "এই পণ্যটি খুব ভালো, আমি খুব খুশি।",
    "Marathi":   "हे उत्पादन खूप वाईट आहे, मी निराश आहे.",
    "Gujarati":  "આ ઉત્પાદન ખૂબ સરસ છે, હું ખૂબ ખુશ છું.",
    "Punjabi":   "ਇਹ ਉਤਪਾਦ ਬਹੁਤ ਵਧੀਆ ਹੈ, ਮੈਂ ਬਹੁਤ ਖੁਸ਼ ਹਾਂ।",
    "Urdu":      "یہ پروڈکٹ بہت خراب ہے، میں مایوس ہوں۔",
}

for lang, text in samples.items():
    r = predict_one(text)
    print(f"\nInput language: {lang}")
    print(f"Text: {text}")
    print(f"Prediction: {r['sentiment']}")
    probs = "  ".join(f"{k}: {v:.4f}" for k, v in r["probabilities"].items())
    print(f"Probabilities: {probs}")
    print(f"Confidence: {r['confidence']:.4f}")
