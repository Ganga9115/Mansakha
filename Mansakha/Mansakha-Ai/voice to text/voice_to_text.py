import os
import sys
import time

# Reconfigure stdout/stderr for UTF-8 on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from indic_transcribe import transcribe, SUPPORTED_LANGUAGES

def record_microphone(duration=5, sample_rate=16000):
    try:
        import sounddevice as sd
    except ImportError:
        print("sounddevice library not installed.")
        sys.exit(1)

    print(f"\n🎙️  Recording from your microphone for {duration} seconds...")
    print("👉 Speak now into your mic...")
    recording = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='float32')
    for remaining in range(duration, 0, -1):
        sys.stdout.write(f"\r⏳ {remaining}s remaining... ")
        sys.stdout.flush()
        time.sleep(1)
    sd.wait()
    sys.stdout.write("\r✅ Recording finished! Transcribing...\n")
    sys.stdout.flush()
    return (sample_rate, recording.flatten())

def main():
    args = sys.argv[1:]

    # Check if an audio file was provided
    if args and not args[0].startswith("-"):
        audio_file = args[0]
        lang = args[1] if len(args) > 1 else "auto"
        print(f"\n📂 Audio File: {audio_file}")
    else:
        # Default: record 5 seconds from microphone
        sec = 5
        if "--sec" in args:
            idx = args.index("--sec")
            if idx + 1 < len(args):
                sec = int(args[idx + 1])
        lang = "auto"
        audio_file = record_microphone(duration=sec)

    t0 = time.time()
    result = transcribe(audio_file, lang_code=lang)
    elapsed = time.time() - t0

    print("\n" + "=" * 60)
    print("📝 TRANSCRIPTION RESULT:")
    print("=" * 60)
    print(result["text"])
    print("=" * 60)
    lang_name = SUPPORTED_LANGUAGES.get(result['language'], {}).get('name', result['language'])
    print(f"🌐 Language: {lang_name} ({result['language']}) | Confidence: {result['probability']*100:.1f}% | Time: {elapsed:.2f}s")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()
