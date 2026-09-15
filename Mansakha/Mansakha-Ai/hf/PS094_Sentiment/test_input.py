"""
Quick test script for the PS 094 Sentiment Model: takes input text and returns
its predicted sentiment state (NEGATIVE / POSITIVE).

Loads the trained model from C:\\Users\\yukes\\Downloads\\hf\\PS094_Sentiment_Model
(no retraining).

Usage:
    python test_input.py                        # interactive loop, prompts for text
    python test_input.py --text "some sentence"  # one-shot, prints the state and exits
"""

import argparse

from predict import predict_one


def get_state(text: str) -> str:
    """Return just the predicted sentiment state ("NEGATIVE" / "POSITIVE") for a piece
    of text. Import this into other scripts (e.g. the downstream PS 094 pipeline) when
    only the label is needed, not the full probability breakdown."""
    result = predict_one(text)
    return result["sentiment"]


def run_interactive():
    print("PS 094 Sentiment Model -- interactive test")
    print("Type a sentence and press Enter to see its predicted state.")
    print("Type 'quit', 'exit', or leave the line blank to stop.\n")
    while True:
        try:
            text = input("Input text: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not text or text.lower() in {"quit", "exit"}:
            break

        result = predict_one(text)
        print(f"State: {result['sentiment']}")
        for label, prob in result["probabilities"].items():
            print(f"  {label}: {prob:.4f}")
        print(f"Confidence: {result['confidence']:.4f}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Get the predicted sentiment state for a piece of input text."
    )
    parser.add_argument("--text", type=str, help="Text to classify (skips interactive mode)")
    args = parser.parse_args()

    if args.text:
        state = get_state(args.text)
        print(f"State: {state}")
    else:
        run_interactive()


if __name__ == "__main__":
    main()
