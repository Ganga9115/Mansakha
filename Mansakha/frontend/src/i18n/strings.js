// Hand-rolled i18n (no new dependency - a plain dictionary + context, not
// i18next) covering the Victim App's Language Select screen (Build Prompt
// Section 8's actual first screen, never built until now) and the check-in
// prompts (Section 4.1's "conversational prompts" - the highest-value place
// for this to exist first). These are AI-produced translations, not
// reviewed by a native speaker - fine for a working demo, flagged in
// LAST_PRIORITY.md as needing human review before any real deployment.
// Coverage is deliberately not app-wide yet: Staff/Ministry stay English
// (Section 8 only calls out Language Select for Victim), and most other
// Victim screens' body copy is still English-only - also tracked there
// rather than silently left out.
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'mr', name: 'मराठी' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'ta', name: 'தமிழ்' },
];

export const strings = {
  en: {
    tagline: "Mind matters. We're listening.",
    languageSelectTitle: 'Choose your language',
    languageSelectSubtitle: 'You can change this anytime in Settings.',
    continueLabel: 'Continue',
    checkinTitle: 'Check-in',
    prompt1: 'How are you feeling?',
    prompt2: 'Do you feel safe?',
    prompt3: 'Are you experiencing stress or fear?',
    followUpPrompt: 'It sounds like things have been difficult - is there anything specific troubling you that you would like to add?',
    answerPlaceholder: 'Type your answer',
    answerRequired: 'Please answer this question.',
    submitCheckin: 'Submit check-in',
  },
  hi: {
    tagline: 'मन मायने रखता है। हम सुन रहे हैं।',
    languageSelectTitle: 'अपनी भाषा चुनें',
    languageSelectSubtitle: 'आप इसे कभी भी सेटिंग्स में बदल सकते हैं।',
    continueLabel: 'जारी रखें',
    checkinTitle: 'चेक-इन',
    prompt1: 'आप कैसा महसूस कर रहे हैं?',
    prompt2: 'क्या आप सुरक्षित महसूस करते हैं?',
    prompt3: 'क्या आप तनाव या डर महसूस कर रहे हैं?',
    followUpPrompt: 'लगता है हाल ही में चीज़ें मुश्किल रही हैं - क्या कुछ खास है जो आपको परेशान कर रहा है और आप बताना चाहेंगे?',
    answerPlaceholder: 'अपना उत्तर लिखें',
    submitCheckin: 'चेक-इन सबमिट करें',
  },
  bn: {
    tagline: 'মন গুরুত্বপূর্ণ। আমরা শুনছি।',
    languageSelectTitle: 'আপনার ভাষা নির্বাচন করুন',
    languageSelectSubtitle: 'আপনি এটি সেটিংসে যেকোনো সময় পরিবর্তন করতে পারেন।',
    continueLabel: 'চালিয়ে যান',
    checkinTitle: 'চেক-ইন',
    prompt1: 'আপনি কেমন অনুভব করছেন?',
    prompt2: 'আপনি কি নিরাপদ বোধ করছেন?',
    prompt3: 'আপনি কি চাপ বা ভয় অনুভব করছেন?',
    followUpPrompt: 'মনে হচ্ছে সম্প্রতি বিষয়গুলো কঠিন গেছে - এমন কিছু কি আছে যা আপনাকে বিরক্ত করছে এবং যোগ করতে চান?',
    answerPlaceholder: 'আপনার উত্তর লিখুন',
    submitCheckin: 'চেক-ইন জমা দিন',
  },
  mr: {
    tagline: 'मन महत्त्वाचे आहे. आम्ही ऐकत आहोत.',
    languageSelectTitle: 'तुमची भाषा निवडा',
    languageSelectSubtitle: 'तुम्ही हे सेटिंग्जमध्ये कधीही बदलू शकता.',
    continueLabel: 'सुरू ठेवा',
    checkinTitle: 'चेक-इन',
    prompt1: 'तुम्हाला कसे वाटत आहे?',
    prompt2: 'तुम्हाला सुरक्षित वाटत आहे का?',
    prompt3: 'तुम्हाला ताण किंवा भीती जाणवत आहे का?',
    followUpPrompt: 'अलीकडे गोष्टी कठीण गेल्या असाव्यात असे वाटते - तुम्हाला त्रास देणारी काही विशिष्ट गोष्ट आहे का जी तुम्ही सांगू इच्छिता?',
    answerPlaceholder: 'तुमचे उत्तर लिहा',
    submitCheckin: 'चेक-इन सबमिट करा',
  },
  te: {
    tagline: 'మనసు ముఖ్యం. మేము వింటున్నాము.',
    languageSelectTitle: 'మీ భాషను ఎంచుకోండి',
    languageSelectSubtitle: 'మీరు దీన్ని సెట్టింగ్‌లలో ఎప్పుడైనా మార్చుకోవచ్చు.',
    continueLabel: 'కొనసాగించండి',
    checkinTitle: 'చెక్-ఇన్',
    prompt1: 'మీరు ఎలా భావిస్తున్నారు?',
    prompt2: 'మీకు సురక్షితంగా అనిపిస్తుందా?',
    prompt3: 'మీరు ఒత్తిడి లేదా భయాన్ని అనుభవిస్తున్నారా?',
    followUpPrompt: 'ఇటీవల విషయాలు కష్టంగా ఉన్నట్లు అనిపిస్తుంది - మిమ్మల్ని ఇబ్బంది పెడుతున్న ప్రత్యేకమైనది ఏదైనా జోడించాలనుకుంటున్నారా?',
    answerPlaceholder: 'మీ సమాధానం టైప్ చేయండి',
    submitCheckin: 'చెక్-ఇన్ సమర్పించండి',
  },
  ta: {
    tagline: 'மனம் முக்கியம். நாங்கள் கேட்கிறோம்.',
    languageSelectTitle: 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்',
    languageSelectSubtitle: 'அமைப்புகளில் இதை எப்போது வேண்டுமானாலும் மாற்றலாம்.',
    continueLabel: 'தொடரவும்',
    checkinTitle: 'செக்-இன்',
    prompt1: 'நீங்கள் எப்படி உணர்கிறீர்கள்?',
    prompt2: 'நீங்கள் பாதுகாப்பாக உணர்கிறீர்களா?',
    prompt3: 'நீங்கள் மன அழுத்தம் அல்லது பயத்தை உணர்கிறீர்களா?',
    followUpPrompt: 'சமீபத்தில் விஷயங்கள் கடினமாக இருந்திருக்கலாம் என்று தோன்றுகிறது - நீங்கள் குறிப்பாக தொந்தரவு படுத்தும் ஏதேனும் விஷயத்தைச் சேர்க்க விரும்புகிறீர்களா?',
    answerPlaceholder: 'உங்கள் பதிலை தட்டச்சு செய்யவும்',
    submitCheckin: 'செக்-இன் சமர்ப்பிக்கவும்',
  },
};

export function translate(languageCode, key) {
  return strings[languageCode]?.[key] ?? strings.en[key] ?? key;
}
