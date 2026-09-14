import os
import sys
import argparse
import time

# Reconfigure stdout/stderr for UTF-8 on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from indic_transcribe import transcribe, SUPPORTED_LANGUAGES

def list_languages():
    print("\nSupported Languages:")
    print("-" * 50)
    print(f"{'Code':<6} {'Language':<15} {'Native Name':<15}")
    print("-" * 50)
    for code, info in SUPPORTED_LANGUAGES.items():
        print(f"{code:<6} {info['name']:<15} {info.get('native', ''):<15}")
    print("-" * 50)

def record_audio(duration: int = 5, sample_rate: int = 16000):
    """
    Records audio from the microphone using sounddevice.
    """
    try:
        import sounddevice as sd
    except ImportError:
        print("Error: sounddevice is not installed. Run 'pip install sounddevice'.")
        sys.exit(1)

    print(f"\nRecording from microphone for {duration} seconds...")
    print("Speak clearly now...")
    recording = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='float32')
    for remaining in range(duration, 0, -1):
        sys.stdout.write(f"\rTime remaining: {remaining}s ")
        sys.stdout.flush()
        time.sleep(1)
    sd.wait()
    sys.stdout.write("\rRecording complete! Processing...   \n")
    sys.stdout.flush()
    return (sample_rate, recording.flatten())

def main():
    parser = argparse.ArgumentParser(
        description="IndicWhisper Local Voice-to-Text Transcription Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python cli.py --audio audio.mp3 --language hi
  python cli.py --audio meeting.wav --language ta --output transcript.txt
  python cli.py --record 10 --language te
  python cli.py --list-languages
        """
    )
    parser.add_argument("--audio", "-a", type=str, help="Path to input audio file (.wav, .mp3, .m4a, etc.)")
    parser.add_argument("--record", "-r", type=int, metavar="SECONDS", help="Record audio from microphone for N seconds")
    parser.add_argument("--language", "-l", type=str, default="hi",
                        choices=list(SUPPORTED_LANGUAGES.keys()),
                        help="Language code (default: hi for Hindi)")
    parser.add_argument("--output", "-o", type=str, help="Optional text file to save the transcription")
    parser.add_argument("--engine", "-e", type=str, default="fast",
                        choices=["fast", "indicwhisper"],
                        help="ASR engine: 'fast' (local instant GPU Whisper) or 'indicwhisper' (AI4Bharat fine-tuned medium)")
    parser.add_argument("--list-languages", action="store_true", help="List all supported Indian languages")

    args = parser.parse_args()

    if args.list_languages:
        list_languages()
        return

    if not args.audio and not args.record:
        parser.print_help()
        print("\nPlease specify either --audio <path> or --record <seconds>.")
        sys.exit(1)

    lang_info = SUPPORTED_LANGUAGES.get(args.language, {})
    lang_name = lang_info.get("name", args.language)
    native_name = lang_info.get("native", "")

    print(f"\nLanguage selected: {lang_name} ({native_name}) [Code: {args.language}]")

    start_time = time.time()

    if args.record:
        audio_input = record_audio(duration=args.record)
    else:
        if not os.path.exists(args.audio):
            print(f"Error: Audio file not found: {args.audio}")
            sys.exit(1)
        audio_input = args.audio
        print(f"Processing audio file: {args.audio}")

    print(f"Transcribing with {args.engine.upper()} engine...")
    try:
        text = transcribe(audio_input, lang_code=args.language, engine=args.engine)
    except Exception as e:
        print(f"\nTranscription failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    elapsed = time.time() - start_time

    print("\n" + "=" * 60)
    print("TRANSCRIPTION RESULT:")
    print("=" * 60)
    # Ensure stdout handles Unicode characters on Windows
    try:
        print(text)
    except UnicodeEncodeError:
        sys.stdout.buffer.write(text.encode('utf-8', errors='replace') + b'\n')
    print("=" * 60)
    print(f"Completed in {elapsed:.2f} seconds.")

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print(f"Saved transcript to: {args.output}")

if __name__ == "__main__":
    main()
