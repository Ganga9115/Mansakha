import os
import sys
import time
import gradio as gr

# Reconfigure stdout/stderr for UTF-8 on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from indic_transcribe import transcribe, SUPPORTED_LANGUAGES

LANGUAGE_CHOICES = [
    (f"{info['native']} ({info['name']})", code)
    for code, info in SUPPORTED_LANGUAGES.items()
]

def run_transcription(audio, lang_code):
    if audio is None:
        return "⚠️ Please record your voice or select an audio file first.", ""

    t0 = time.time()
    try:
        res = transcribe(audio, lang_code=lang_code)
        elapsed = time.time() - t0
        lang_detected = res["language"]
        lang_name = SUPPORTED_LANGUAGES.get(lang_detected, {}).get("name", lang_detected)
        prob = res["probability"] * 100

        status = f"✅ Transcribed in {elapsed:.2f}s | Detected Language: {lang_name} ({lang_detected.upper()}) with {prob:.1f}% confidence"
        return res["text"], status
    except Exception as e:
        return f"Error: {e}", f"Failed: {e}"

with gr.Blocks(title="Voice to Text") as demo:
    gr.Markdown(
        """
        # 🎙️ Multilingual Voice-to-Text
        ### Speak into your microphone or upload audio in any Indian language or English.
        """
    )

    with gr.Row():
        with gr.Column(scale=1):
            audio_input = gr.Audio(
                sources=["microphone", "upload"],
                type="filepath",
                label="Record Voice or Upload Audio"
            )

            language_dropdown = gr.Dropdown(
                choices=LANGUAGE_CHOICES,
                value="auto",
                label="Spoken Language",
                info="Keep as 'Auto Detect' or pick your specific language"
            )

            with gr.Row():
                transcribe_btn = gr.Button("🎙️ Transcribe Voice to Text", variant="primary", size="lg")
                clear_btn = gr.Button("Clear", variant="secondary")

            with gr.Row():
                sample_hi = gr.Button("Test Hindi Sample 🇮🇳", size="sm")
                sample_en = gr.Button("Test English Sample 🌐", size="sm")

        with gr.Column(scale=1):
            output_text = gr.Textbox(
                label="Transcribed Text",
                placeholder="Your spoken words will appear here...",
                lines=10
            )
            status_text = gr.Markdown("Ready to transcribe.")

    sample_hi.click(
        fn=lambda: ("sample_hindi.mp3", "hi"),
        inputs=[],
        outputs=[audio_input, language_dropdown]
    )

    sample_en.click(
        fn=lambda: ("sample_english.mp3", "en"),
        inputs=[],
        outputs=[audio_input, language_dropdown]
    )

    transcribe_btn.click(
        fn=run_transcription,
        inputs=[audio_input, language_dropdown],
        outputs=[output_text, status_text]
    )

    clear_btn.click(
        fn=lambda: (None, "auto", "", "Ready to transcribe."),
        inputs=[],
        outputs=[audio_input, language_dropdown, output_text, status_text]
    )

if __name__ == "__main__":
    demo.launch(server_name="127.0.0.1", server_port=7860, share=False)
