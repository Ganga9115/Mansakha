import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
} from 'expo-audio';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import { useToast } from '../../shared/context/ToastContext';
import { useCheckin, useUserDashboard, useUserHistory, useAppendInteraction } from '../../shared/services/hooks';
import { generateInteractiveQuestion, analyzeConversation, OPENING_GREETING, SECOND_QUESTION } from '../../shared/services/ollamaClient';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';
import BottomNavBar from '../../shared/components/BottomNavBar';
import { pickSupportiveQuote } from '../data/supportiveQuotes';
import { transcribeAudioBlob } from '../../shared/hooks/useSpeechToText';

const TOTAL_QUESTIONS = 15;

// Real Apple emoji artwork (from emoji-datasource-apple), bundled locally so
// it renders identically on web/Android/iOS instead of relying on each
// platform's own emoji font - Windows' Segoe UI Emoji looks nothing like
// Apple's style, which is what these are standing in for everywhere.
const EMOJI = {
  pensive: require('../../../../assets/emoji-pensive.png'),
  confused: require('../../../../assets/emoji-confused.png'),
  neutral: require('../../../../assets/emoji-neutral.png'),
  slightlySmiling: require('../../../../assets/emoji-slightly_smiling.png'),
  grinning: require('../../../../assets/emoji-grinning.png'),
  handshake: require('../../../../assets/emoji-handshake.png'),
  speechBalloon: require('../../../../assets/emoji-speech_balloon.png'),
  thinking: require('../../../../assets/emoji-thinking.png'),
  sleeping: require('../../../../assets/emoji-sleeping.png'),
  relieved: require('../../../../assets/emoji-relieved.png'),
  crying: require('../../../../assets/emoji-crying.png'),
  angry: require('../../../../assets/emoji-angry.png'),
  fearful: require('../../../../assets/emoji-fearful.png'),
  pray: require('../../../../assets/emoji-pray.png'),
  disappointed: require('../../../../assets/emoji-disappointed.png'),
  strong: require('../../../../assets/emoji-strong.png'),
};

export default function CheckinScreen({ navigation }) {
  const toast = useToast();
  const dashboardQuery = useUserDashboard();
  const { tier, isDesktop } = useResponsive();

  const submitMutation = useCheckin();
  const historyQuery = useUserHistory();
  const appendInteraction = useAppendInteraction();
  const insets = useSafeAreaInsets();

  const [responses, setResponses] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState({
    text: OPENING_GREETING,
    type: 'single',
    options: ['I am doing okay', 'I am feeling anxious', 'I need some help', 'Other...']
  });
  const [draft, setDraft] = useState('');
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [pastContext, setPastContext] = useState('');

  // Recording is per-question - each question gets its own voice answer,
  // transcribed to text via transcribeAudioBlob (IIT Madras Speech Lab ASR,
  // falling back to the local Django/IndicWhisper pipeline - see
  // useSpeechToText.js) and folded into that question's combinedAnswer, so
  // it flows through the exact same conversation/analysis pipeline as a
  // typed or tapped answer - no backend change needed for the text side.
  // The raw clip (voiceAudioBase64) is still kept and sent once at final
  // submission for the separate acoustic Voice Stress signal - the backend
  // only accepts a single audioBase64 per check-in, so whichever question
  // was recorded most recently is the one that feeds that signal, same as
  // before.
  const [voiceAudioBase64, setVoiceAudioBase64] = useState(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  // The Check-in tab stays mounted under React Navigation's bottom-tab
  // navigator, so without this, finishing a check-in left isFinished stuck
  // at true forever - the very next visit to this tab showed the
  // "Analyzing your responses..." spinner permanently (and hid the quote
  // box, gated on the same condition) instead of a fresh question 1,
  // because nothing ever set isFinished back to false. Resetting on focus,
  // but only when isFinished is already true, means an accidental tab
  // switch mid check-in doesn't wipe in-progress answers - only returning
  // after an actual completed submission starts over.
  useFocusEffect(
    useCallback(() => {
      if (isFinished) {
        setResponses([]);
        setCurrentQuestion({
          text: OPENING_GREETING,
          type: 'single',
          options: ['I am doing okay', 'I am feeling anxious', 'I need some help', 'Other...']
        });
        setSelectedOptions([]);
        setDraft('');
        setVoiceAudioBase64(null);
        setVoiceTranscript('');
        setSubmitting(false);
        setIsFinished(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFinished])
  );

  useEffect(() => {
    if (historyQuery.data?.history) {
      setPastContext(historyQuery.data.history);
    }
  }, [historyQuery.data]);

  const startVoiceNote = async () => {
    try {
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted) {
        permission = await requestRecordingPermissionsAsync();
      }
      if (!permission.granted) {
        toast.error('Microphone permission is required to add a voice note.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (err) {
      toast.error(err.message || 'Could not start recording.');
    }
  };

  const stopVoiceNote = async () => {
    try {
      await recorder.stop();
    } catch (err) {
      toast.error(err.message || 'Could not stop recording.');
      return;
    }
    const uri = recorder.uri;
    if (!uri) {
      toast.error('Recording failed - no audio was captured.');
      return;
    }
    setIsTranscribingVoice(true);
    try {
      // Web-only base64 conversion, matching ChatScreen.js's own voice-note
      // handling - `uri` is a blob: URL on web, so it needs re-fetching
      // into a Blob before FileReader can read it as a data URL.
      const blob = await fetch(uri).then((r) => r.blob());
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      setVoiceAudioBase64(base64Data);

      // Transcription runs quietly in the background - no toast either way,
      // success or failure. If it fails, the raw clip is still kept for the
      // acoustic Voice Stress signal, so there's nothing the user needs to
      // be alarmed about or act on.
      const result = await transcribeAudioBlob(blob, 'english');
      if (result && result.transcript) {
        setVoiceTranscript(result.transcript);
      }
    } catch (err) {
      // Silent - see comment above.
    } finally {
      setIsTranscribingVoice(false);
    }
  };

  const discardVoiceNote = () => {
    setVoiceAudioBase64(null);
    setVoiceTranscript('');
  };

  // Only ever used from question 3 onward (questions 1-2 are fixed and
  // identical for every user - see OPENING_GREETING/SECOND_QUESTION) and
  // only when Ollama is offline/slow, so this is the check-in's entire
  // offline experience for most of its length - worth being as varied and
  // case-appropriate as the live AI path, not a generic filler list.
  // Grouped by broad case theme (never shown or referenced to the user) so
  // even the offline fallback stays roughly relevant without ever naming
  // the case type, the offense, or using the word "victim" anywhere below.
  const FALLBACK_QUESTIONS_BY_TRACK = {
    general: [
      { q: "How has your appetite been lately?", o: ['Eating normally', 'Not much of an appetite', 'Eating more than usual', 'It varies day to day'] },
      { q: "Who have you been spending time with recently?", o: ['Family', 'Friends', 'Mostly by myself', 'My counsellor or support worker'] },
      { q: "What's something that's helped you feel a little steadier lately?", o: ['Talking to someone', 'Keeping busy', 'Just resting', 'Nothing in particular has helped'] },
      { q: "How connected do you feel to the people around you right now?", o: ['Very connected', 'Somewhat', 'A bit distant', 'Quite isolated'] },
      { q: "How has your day-to-day routine been going?", o: ['Pretty normal', 'A bit disrupted', 'Hard to keep up with', "I've made some changes that help"] },
      { q: "Do you feel like you have someone to talk to when things feel heavy?", o: ['Yes, definitely', 'Sometimes', 'Not really', "I'd like to, but haven't yet"] },
      { q: "How would you describe your mood over the past few days?", o: ['Fairly steady', 'Up and down', 'Low most of the time', 'Better than before'] },
      { q: "Is there anything practical - money, work, daily needs - on your mind right now?", o: ['Not really', 'A little', 'Yes, quite a bit', 'I could use some guidance'] },
      { q: "How are you feeling about the days ahead?", o: ['Hopeful', 'Uncertain', 'Anxious', 'Taking it one day at a time'] },
      { q: "What would make today feel a little easier?", o: ['Some rest', 'Company', 'A distraction', 'Nothing comes to mind'] },
      { q: "How have you been taking care of yourself lately?", o: ['Pretty well', 'Trying my best', 'Not really focused on it', 'I could use some ideas'] },
      { q: "Before we wrap up, is there anything on your mind you'd like noted?", o: ["No, I'm okay", 'Yes, something small', 'Yes, something important', "I'd rather discuss it directly with my counsellor"] },
    ],
    violence: [
      { q: "How are things at home right now?", o: ['Stable', 'Stressful but manageable', 'Really difficult', "I'd rather not go into it"] },
      { q: "How is the rest of your family coping these days?", o: ['Doing okay', 'Struggling a bit', 'Finding it hard', "Not sure, we don't talk about it much"] },
      { q: "Is there anything practical - money, housing, safety - weighing on you?", o: ['Not really', 'A little', 'Yes, quite a bit', 'I need help with something specific'] },
      { q: "How connected do you feel to your community or neighbours right now?", o: ['Supported', "It's mixed", 'A bit distant', 'Rather isolated'] },
      { q: "How has your physical health been?", o: ['Fine', 'A few aches or issues', 'Still recovering from something', 'I should get this checked'] },
      { q: "What's helped you get through the harder days recently?", o: ['Family', 'Keeping busy', 'Rest', 'Honestly, nothing has helped much'] },
      { q: "How do you feel about the people supporting you right now?", o: ['Well supported', 'Somewhat', 'I could use more support', 'I feel mostly on my own'] },
      { q: "How's your sense of safety at home lately?", o: ['I feel safe', 'Mostly, with some worry', 'Not very safe', "I'd like to talk about this"] },
      { q: "Are any responsibilities feeling heavier than usual right now?", o: ['Not really', 'A bit', 'Yes, quite a lot', 'I need some help managing things'] },
      { q: "How are you feeling about things day to day?", o: ['Managing okay', 'Some good days, some hard ones', 'Mostly difficult', 'Better than a few weeks ago'] },
    ],
    sexual: [
      { q: "Who do you feel most comfortable talking to these days?", o: ['Family', 'Friends', 'My counsellor', 'I mostly keep to myself'] },
      { q: "Do you feel safe in the place you're currently staying?", o: ['Yes', 'Mostly, with a little unease', 'Not really', "I'd rather discuss this privately"] },
      { q: "How has your mood been the past few days?", o: ['Fairly steady', 'Up and down', 'Low most days', 'Better than before'] },
      { q: "Is there anything that's been helping you feel a bit calmer lately?", o: ['Talking to someone', 'Being alone for a while', 'Staying busy', 'Nothing in particular'] },
      { q: "How connected do you feel to people who care about you right now?", o: ['Very connected', 'Somewhat', 'A little distant', 'Quite alone'] },
      { q: "How has your sleep been this week?", o: ['Sleeping okay', 'Some restless nights', 'Struggling to sleep', 'Sleeping much more than usual'] },
      { q: "Would it help to have someone check in with you more regularly?", o: ['Yes, that would help', 'Maybe', "I'm okay for now", "I'd rather not say"] },
      { q: "How are you feeling about the days ahead?", o: ['Hopeful', 'Uncertain', 'Anxious', 'Taking it slowly, one day at a time'] },
      { q: "Is there anything you need right now that you haven't been able to get?", o: ["No, I'm okay", 'A little support', 'Yes, something specific', "I'd rather tell my counsellor directly"] },
      { q: "Right now, in this moment, how are you feeling?", o: ['Calm', 'A bit anxious', 'Tired', 'Better than when we started'] },
    ],
    caste: [
      { q: "How are people in your neighbourhood or community treating you lately?", o: ['No real change', 'A bit distant', 'Some tension', "I'd rather not say"] },
      { q: "Do you feel like you can go about your daily routine without worry?", o: ['Yes, mostly', 'Some days are harder', 'I feel on edge often', 'Not at all right now'] },
      { q: "How is your family holding up these days?", o: ['Doing okay', "It's difficult", 'Mixed - some better, some worse', "We don't talk about it much"] },
      { q: "Do you feel supported by people around you right now?", o: ['Yes, well supported', 'Somewhat', 'Not really', 'I feel quite alone in this'] },
      { q: "How has going to work, school, or your usual places felt lately?", o: ['Normal', 'A bit uncomfortable', 'Difficult', "I've been avoiding some places"] },
      { q: "What's helped you feel a bit more at ease recently?", o: ['Family', 'Friends', 'Staying busy', 'Nothing has really helped'] },
      { q: "How confident do you feel about things improving over time?", o: ['Fairly hopeful', 'Uncertain', 'Not very hopeful', 'Taking it day by day'] },
      { q: "Is there anything about your daily safety on your mind right now?", o: ['Not really', 'A little', 'Yes, quite a bit', "I'd like to discuss this further"] },
      { q: "How connected do you feel to your wider community right now?", o: ['Still connected', "It's changed a bit", 'Quite distant', 'Very isolated'] },
      { q: "Before we finish, is there anything you'd like your counsellor to know?", o: ["No, I'm okay", 'Something small', 'Something important', "I'll share it directly"] },
    ],
    witness: [
      { q: "Have you noticed any unwanted contact or pressure from anyone connected to the case?", o: ['No, nothing', 'A little, nothing serious', "Yes, and it's concerning me", "I'd rather discuss this privately"] },
      { q: "How confident do you feel about your safety right now?", o: ['Fairly confident', 'Somewhat unsure', 'Quite worried', 'I need support with this'] },
      { q: "How has your daily routine been affected lately?", o: ['Not much change', 'Some adjustments', 'Significantly disrupted', "I've had to change my routine for safety"] },
      { q: "Do you feel supported by the people around you right now?", o: ['Yes, well supported', 'Somewhat', 'Not really', 'I feel mostly on my own'] },
      { q: "How has your sleep been given everything going on?", o: ['Sleeping okay', 'A bit restless', 'Struggling to sleep', 'Sleeping much more than usual'] },
      { q: "Is there anyone you trust that you can talk to if something feels off?", o: ['Yes, definitely', 'Somewhat', 'Not really', "I'd like to identify someone"] },
      { q: "How are you feeling about the road ahead?", o: ['Steady', 'Anxious', 'Uncertain', 'Taking it one step at a time'] },
      { q: "What would help you feel a bit safer or calmer right now?", o: ['More regular check-ins', 'Practical safety advice', 'Just talking it through', 'Nothing specific comes to mind'] },
      { q: "How connected do you feel to your normal support system right now?", o: ['Still connected', 'A bit distant', 'Quite isolated', 'I could use reconnecting'] },
      { q: "Before we finish, is there anything about your safety you'd like noted?", o: ["No, I'm okay", 'Something small', 'Something important', "I'd rather tell my counsellor directly"] },
    ],
  };

  const CASE_TYPE_TO_TRACK = {
    'Murder': 'violence',
    'Grievous Hurt': 'violence',
    'Arson': 'violence',
    'Murder / Grievous Hurt / Arson': 'violence',
    'Rape': 'sexual',
    'Gang Rape': 'sexual',
    'Rape / Gang Rape': 'sexual',
    'Family Affected by Caste-Based Violence': 'caste',
    'Witness Facing Intimidation or Threats': 'witness',
  };

  const caseType = dashboardQuery.data?.caseType || null;
  const fallbackTrack = CASE_TYPE_TO_TRACK[caseType] || 'general';
  const fallbackQuestions = FALLBACK_QUESTIONS_BY_TRACK[fallbackTrack];

  const loadNextQuestion = async (history) => {
    setLoading(true);
    try {
      const conversation = [];
      for (const item of history) {
        conversation.push({ role: 'assistant', content: item.q });
        conversation.push({ role: 'user', content: item.a });
      }

      const nextQ = await generateInteractiveQuestion(conversation, pastContext, caseType);
      setCurrentQuestion({
        text: nextQ.question,
        type: nextQ.type || 'single',
        options: nextQ.options || ['Yes', 'No']
      });
      setSelectedOptions([]);
      setDraft('');
      setVoiceTranscript('');
    } catch (err) {
      // Silent fallback by design - a victim mid-check-in should never see a
      // technical error about the AI backend, the check-in should just keep
      // moving using a pre-written, case-appropriate question instead.
      // -2: the first two fixed questions never draw from this pool, so the
      // pool starts at question 3 (history.length === 2 at that point).
      const fallbackIndex = Math.max(0, history.length - 2) % fallbackQuestions.length;
      const fallbackQ = fallbackQuestions[fallbackIndex];
      setCurrentQuestion({
        text: fallbackQ.q,
        type: 'single',
        options: fallbackQ.o,
      });
      setSelectedOptions([]);
      setDraft('');
      setVoiceTranscript('');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async (isSkipped = false) => {
    if (loading || submitting || isFinished || responses.length >= TOTAL_QUESTIONS) return;

    const isOtherSelected = selectedOptions.includes('Other...');
    let combinedAnswer = "Skipped.";
    if (!isSkipped) {
      const parts = [];
      const optionText = selectedOptions.filter(o => o !== 'Other...').join(', ');
      if (optionText) parts.push(optionText);
      if (isOtherSelected && draft.trim()) parts.push(draft.trim());
      // The transcribed voice answer is its own part of this question's
      // answer, alongside (or instead of) any tapped options - this is what
      // lets a question be answered purely by voice.
      if (voiceTranscript.trim()) parts.push(voiceTranscript.trim());
      combinedAnswer = parts.join(', ');
    }

    if (!isSkipped && !combinedAnswer) return;
    
    const newHistory = [...responses, { q: currentQuestion.text, a: combinedAnswer }];
    setResponses(newHistory);
    
    appendInteraction.mutate(`Mansakha: ${currentQuestion.text}\nPerson: ${combinedAnswer}`, { onError: () => {} });
    
    if (newHistory.length >= TOTAL_QUESTIONS) {
      setIsFinished(true);
      await handleSubmit(newHistory);
    } else if (newHistory.length === 1) {
      // Question 2 is fixed and identical for every user, same as question 1
      // (OPENING_GREETING) - no AI/fallback call, no case-type branching yet.
      // Adaptive, case-aware questions only start from question 3 onward.
      setCurrentQuestion(SECOND_QUESTION);
      setSelectedOptions([]);
      setDraft('');
      setVoiceTranscript('');
    } else {
      await loadNextQuestion(newHistory);
    }
  };

  const toggleOption = (opt) => {
    if (currentQuestion.type === 'single') {
      setSelectedOptions([opt]);
    } else {
      setSelectedOptions(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]);
    }
  };

  const handleSubmit = async (finalResponses) => {
    setSubmitting(true);
    try {
      const conversation = [];
      for (const item of finalResponses) {
        conversation.push({ role: 'assistant', content: item.q });
        conversation.push({ role: 'user', content: item.a });
      }
      
      const aiAnalysis = await analyzeConversation(conversation);
      const formattedResponses = finalResponses.map(r => `Mansakha: ${r.q}\nPerson: ${r.a}`);
      
      const result = await submitMutation.mutateAsync({
        channel: 'Mobile App',
        responses: formattedResponses,
        aiAnalysis,
        audioBase64: voiceAudioBase64 || undefined,
      });
      
      navigation.navigate('CheckinConfirmation', {
        scored: result.scored,
        riskLevel: result.riskLevel,
        summary: result.summary,
        alertTriggered: result.alertTriggered,
        questionsAnswered: result.questionsAnswered,
        questionsUntilFirstScore: result.questionsUntilFirstScore,
      });
    } catch (err) {
      toast.error(err.message || 'Could not submit your check-in.');
    } finally {
      setSubmitting(false);
    }
  };

  // Matches the "current question number" shown in the fraction label
  // (Math.min(responses.length + 1, TOTAL_QUESTIONS)) rather than
  // "questions completed so far" - so question 1 of 15 shows a small
  // visible sliver of fill instead of a fully empty bar, matching the
  // reference design.
  const progressPercentage = Math.min(((responses.length + 1) / TOTAL_QUESTIONS) * 100, 100);

  // Emoji + a sentiment-tinted circle instead of a flat line icon, matching
  // the reference design's mood-grid look. The fixed first question's 4
  // options must reproduce the reference exactly: doing okay -> mint,
  // feeling anxious -> pink, need some help -> peach, Other... -> lavender
  // (the first three checks below, in that priority order). Below that,
  // more specific topical buckets (sleep, fear, anger, grief, relief,
  // gratitude, pride) run before the generic sentiment fallbacks, so
  // Ollama's free-text options - which range far wider than "positive vs
  // negative" - get a face that actually matches what they say instead of
  // always collapsing to the same handful of generic ones.
  const getOptionIcon = (opt) => {
    const lower = opt.toLowerCase();
    // Help / support-seeking - same worried face as anxious, on peach
    // instead of pink, matching the reference's "I need some help" card.
    if (/(help|support|someone|guidance|assist)/.test(lower)) {
      return { image: EMOJI.confused, bg: '#FBF5EC' };
    }
    // Strongly negative / distressed (incl. anxious - reference's pink card)
    if (/(very low|quite isolated|mostly difficult|not safe|not very|struggl|hard|worried|unsafe|quite a lot|quite a bit|significantly disrupted|no\b|nothing|anxious)/.test(lower)) {
      return { image: EMOJI.confused, bg: '#FDF1F3' };
    }
    // Sleep / rest / tiredness
    if (/(sleep|tired|rest|insomnia|exhausted|fatigue|yawn|nap)/.test(lower)) {
      return { image: EMOJI.sleeping, bg: '#EEF1FA' };
    }
    // Fear / feeling unsafe or threatened
    if (/(afraid|scared|fear|frighten|threat|danger|terrified)/.test(lower)) {
      return { image: EMOJI.fearful, bg: '#F1ECFB' };
    }
    // Anger / frustration
    if (/(angry|anger|frustrat|annoyed|irritat|furious|mad\b)/.test(lower)) {
      return { image: EMOJI.angry, bg: '#FBEAE6' };
    }
    // Crying / grief / heartbreak
    if (/(cry|crying|tearful|heartbroken|grief|grieving|devastat)/.test(lower)) {
      return { image: EMOJI.crying, bg: '#EBF0FA' };
    }
    // Relief / calm / at ease
    if (/(reliev|calmer|at ease|peaceful|settl|soothed)/.test(lower)) {
      return { image: EMOJI.relieved, bg: '#EAF5F1' };
    }
    // Gratitude
    if (/(grateful|thankful|blessed|appreciat)/.test(lower)) {
      return { image: EMOJI.pray, bg: '#FBF3E3' };
    }
    // Disappointment / discouragement
    if (/(disappoint|let down|discourag|disheartened)/.test(lower)) {
      return { image: EMOJI.disappointed, bg: '#EEF0F5' };
    }
    // Pride / accomplishment / feeling capable
    if (/(proud|accomplish|capable|achieved|overcome|resilient)/.test(lower)) {
      return { image: EMOJI.strong, bg: '#EAF3E9' };
    }
    // Mildly negative / uncertain
    if (/(low|sad|uncertain|distant|a bit|somewhat unsure|restless|difficult|isolated|disrupted)/.test(lower)) {
      return { image: EMOJI.pensive, bg: '#FEF5F6' };
    }
    // Positive / calm / okay
    if (/(okay|good|connected|supported|stable|hopeful|safe\b|fine|well|better|steady|normal|calm|confident|yes\b|helped|managing|fairly steady|sometimes)/.test(lower)) {
      return { image: EMOJI.slightlySmiling, bg: '#EEF8F1' };
    }
    // Strongly positive
    if (/(great|really|very connected|very safe|excellent|definitely)/.test(lower)) {
      return { image: EMOJI.grinning, bg: '#E3F2E8' };
    }
    if (lower.includes('other') || lower.includes('rather')) {
      return { image: EMOJI.speechBalloon, bg: colors.primaryLight + 'A0' };
    }
    // Neutral / mixed / "it varies"
    if (/(somewhat|mixed|varies|some|a little)/.test(lower)) {
      return { image: EMOJI.neutral, bg: '#F4F2FA' };
    }
    return { image: EMOJI.thinking, bg: colors.primaryLight };
  };

  const isLongOptions = currentQuestion.options.some(opt => opt.length > 25);
  // Ollama picks anywhere from 2 to 6 options per question, and a flat
  // 3-per-row grid leaves a lone orphan card whenever the count isn't a
  // multiple of 3 (e.g. 4 options -> 3 then 1 alone). Switching to a 2-per-row
  // grid exactly when that would happen (count % 3 === 1, or only 2 options
  // to begin with) keeps every row visually full.
  const optionCount = currentQuestion.options.length;
  const useHalfWidthOptions = optionCount <= 2 || optionCount % 3 === 1;

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Dynamic Header matched with HomeScreen */}
        <View
          style={[
            styles.topHeader,
            isDesktop && styles.topHeaderDesktop,
            !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
          ]}
        >
          <View style={styles.headerLeft}>
            {isDesktop ? (
              <Feather name="mic" size={24} color={colors.primaryDark} style={styles.headerIconDesktop} />
            ) : (
              <View style={styles.avatarContainer}>
                <Feather name="mic" size={28} color={colors.primary} />
              </View>
            )}
            <View style={styles.headerInfo}>
              <Text style={styles.pageTitle}>Check-in</Text>
              <Text style={styles.pageSubtitle}>A safe space for your thoughts</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {isDesktop ? (
              <DesktopHeaderActions
                fullName={dashboardQuery.data?.fullName}
                alertCount={dashboardQuery.data?.alerts?.length || 0}
                onBellPress={() => {}}
              />
            ) : (
              <TopRightActions />
            )}
          </View>
        </View>

        {!isDesktop && (
          <Text style={styles.youMatterTextBelowHeader}>{'You Matter ♡'}</Text>
        )}

        <ScrollView
          style={{ flex: 1 }} 
          contentContainerStyle={{ 
            flexGrow: 1, 
            paddingBottom: !isDesktop ? 140 : spacing.xxxl, // Generous scroll space for BottomNavBar
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.scrollInner}>
            {/* Desktop-only decorative caption, top-right of the content
                column - same "handwritten note" idea as mobile's "You
                Matter" text under the help button, positioned to match the
                desktop reference's top-right placement next to the
                progress bar. */}
            {isDesktop && (
              <View style={styles.youMatterCloudWrap}>
                <MaterialCommunityIcons
                  name="cloud"
                  size={130}
                  color={colors.primary}
                  style={styles.youMatterCloudIcon}
                  pointerEvents="none"
                />
                <Text style={styles.youMatterTextDesktop}>{'You\nMatter ♡'}</Text>
              </View>
            )}
            <View
              style={[
                styles.contentBody,
                isDesktop ? styles.contentBodyDesktop : styles.contentBodyMobile,
                { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' },
              ]}
            >
              {/* Progress Header - single compact row (bar + fraction), same
                  density as the reference design instead of a separate
                  "Question X of Y" label row plus a bar below it. */}
              <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
              </View>
              <Text style={styles.progressFraction}>
                {Math.min(responses.length + 1, TOTAL_QUESTIONS)}/{TOTAL_QUESTIONS}
              </Text>
            </View>

            {/* Main Question Card */}
            <View style={[styles.card, !isDesktop && styles.cardMobile]}>
              {loading || submitting || isFinished ? (
                <View style={styles.loadingArea}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>
                    {submitting || isFinished ? "Analyzing your responses..." : "Mansakha is thinking..."}
                  </Text>
                </View>
              ) : (
                <View style={styles.questionArea}>
                  {/* Small, understated AI indicator - kept (it's real
                      information: an AI, not a human, is asking) but no
                      longer a large badge+avatar row competing with the
                      question for visual weight, matching the reference's
                      much quieter header treatment. */}
                  <View style={styles.aiBadge}>
                    <Feather name="sparkles" size={12} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.aiBadgeText}>AI COMPANION</Text>
                  </View>

                  {/* Mobile splits the fixed opening greeting into a bold
                      headline + lighter sub-line (per the mobile reference),
                      without repeating any words. Desktop shows the whole
                      question as one bold headline, greeting included (per
                      the desktop reference) - every other question, fixed
                      or Ollama-generated, is already a single short
                      question either way. */}
                  {!isDesktop && responses.length === 0 ? (
                    <>
                      <Text style={styles.mainTitle}>Hello. I'm here to listen.</Text>
                      <Text style={styles.subQuestionText}>Take your time. How are you feeling today?</Text>
                    </>
                  ) : (
                    <Text style={styles.mainTitle}>{currentQuestion.text}</Text>
                  )}

                  {/* Dynamic Options Container */}
                  <View style={[styles.optionsGrid, isLongOptions && styles.optionsColumn]}>
                    {currentQuestion.options.map((opt, i) => {
                      const isSelected = selectedOptions.includes(opt);
                      const iconInfo = getOptionIcon(opt);
                      return (
                        <Pressable
                          key={i}
                          style={[
                            styles.optionCard,
                            isDesktop ? styles.optionCardDesktop : { backgroundColor: iconInfo.bg },
                            useHalfWidthOptions ? styles.optionCardHalf : styles.optionCardThird,
                            isLongOptions && styles.optionCardFull,
                            !isDesktop && styles.optionCardMobile,
                            isSelected && styles.optionCardSelected
                          ]}
                          onPress={() => toggleOption(opt)}
                        >
                          {isSelected && (
                            <View style={styles.selectedBadge}>
                              <Feather name="check" size={11} color={colors.onPrimary} />
                            </View>
                          )}
                          <View style={[styles.iconCircle, isDesktop && { backgroundColor: iconInfo.bg }]}>
                            <Image source={iconInfo.image} style={styles.iconEmoji} resizeMode="contain" />
                          </View>
                          <Text
                            style={[
                              styles.optionCardText,
                              isSelected && styles.optionCardTextSelected
                            ]}
                          >
                            {opt}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {selectedOptions.includes('Other...') && (
                    <TextInput
                      style={styles.textInput}
                      placeholder="Type your own answer here..."
                      placeholderTextColor={colors.textSecondary}
                      value={draft}
                      onChangeText={setDraft}
                      multiline
                      numberOfLines={3}
                      autoFocus
                    />
                  )}

                  {/* Voice answer for THIS question specifically - resets
                      every question (see setVoiceTranscript('') alongside
                      setDraft('') above). The clip is transcribed to text
                      via transcribeAudioBlob and folded straight into this
                      question's combinedAnswer, so it's analyzed exactly
                      like a typed answer. The raw clip itself is also kept
                      for the separate acoustic Voice Stress signal sent
                      once at final submission. */}
                  <View style={styles.voiceNoteRow}>
                    {recorderState.isRecording ? (
                      <Pressable style={styles.voiceNoteRecording} onPress={stopVoiceNote}>
                        <View style={styles.recordingDot} />
                        <Text style={styles.voiceNoteRecordingText}>Recording... tap to stop</Text>
                      </Pressable>
                    ) : voiceTranscript ? (
                      <View style={styles.voiceTranscriptBox}>
                        <Feather name="mic" size={14} color={colors.success} style={{ marginTop: 2 }} />
                        <Text style={styles.voiceTranscriptText}>{voiceTranscript}</Text>
                        <Pressable onPress={discardVoiceNote} hitSlop={8}>
                          <Feather name="x" size={16} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable style={styles.voiceNoteBtn} onPress={startVoiceNote}>
                        <Feather name="mic" size={16} color={colors.primary} />
                        <Text style={styles.voiceNoteBtnText}>{isDesktop ? 'Answer with your voice' : 'Add an optional voice note'}</Text>
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.divider} />

                  {/* Card Actions */}
                  <View style={styles.actionRow}>
                    <Pressable style={styles.skipBtn} onPress={() => handleNext(true)}>
                      <Feather name="arrow-left" size={16} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />
                      <Text style={styles.skipBtnText}>
                        {responses.length === TOTAL_QUESTIONS - 1 ? 'Skip & Submit' : 'Skip Question'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.nextBtn, (!selectedOptions.length && !voiceTranscript.trim()) && styles.nextBtnDisabled]}
                      onPress={() => handleNext(false)}
                      disabled={!selectedOptions.length && !voiceTranscript.trim()}
                    >
                      <Text style={styles.nextBtnText}>
                        {responses.length === TOTAL_QUESTIONS - 1 ? 'Finish & Submit' : 'Next'}
                      </Text>
                      <Feather 
                        name={responses.length === TOTAL_QUESTIONS - 1 ? "check" : "arrow-right"} 
                        size={18} 
                        color={colors.onPrimary} 
                        style={{ marginLeft: spacing.xs }} 
                      />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            {/* Supportive quote - its own box below the question card, on
                the page background, matching the reference design exactly
                (not nested inside the card). Picked from a 500+ line bank
                via a hash of the question text, so it's stable while this
                question is on screen but varies question to question -
                purely decorative, never referencing the case, the question,
                or the person's actual answers. */}
            {!(loading || submitting || isFinished) && (
              <View style={styles.quoteCard}>
                <View style={styles.quoteLeafCluster} pointerEvents="none">
                  <MaterialCommunityIcons name="leaf" size={54} color={colors.primary} style={{ opacity: 0.12, transform: [{ rotate: '-12deg' }] }} />
                  <MaterialCommunityIcons name="leaf" size={38} color={colors.primary} style={{ opacity: 0.16, marginLeft: -14, marginTop: 18, transform: [{ rotate: '24deg' }] }} />
                </View>
                <MaterialCommunityIcons name="leaf" size={36} color={colors.primary} style={styles.quoteLeafIcon} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.quoteText}>
                    "{pickSupportiveQuote(currentQuestion.text)}"
                  </Text>
                  <Text style={styles.quoteAttribution}>— Mansakha —</Text>
                </View>
              </View>
            )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {!isDesktop && <BottomNavBar currentTab="CheckIn" navigation={navigation} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.primaryLight,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: colors.primary + '20',
  },
  pageSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 1,
  },
  youMatterTextBelowHeader: {
    fontFamily: 'Caveat_700Bold',
    fontSize: 26,
    lineHeight: 26,
    color: colors.primary,
    textAlign: 'right',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  topHeaderDesktop: {
    height: 64,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: 'center',
  },
  headerIconDesktop: { marginRight: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  headerInfo: { flex: 1 },
  pageTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 24, fontWeight: '700' },
  headerRight: { marginLeft: spacing.md },
  
  scrollInner: {
    flex: 1,
    position: 'relative',
  },
  // Fixed-size box so the icon and the text share the exact same center
  // point, instead of the icon floating off to one side of wherever the
  // text's own auto-sized bounds happened to land.
  youMatterCloudWrap: {
    position: 'absolute',
    top: spacing.lg,
    right: 20,
    width: 150,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A real cloud glyph, not a hand-assembled shape - guarantees it actually
  // reads as a cloud instead of an ambiguous blob/pill.
  youMatterCloudIcon: {
    position: 'absolute',
    top: 0,
    left: 15,
    opacity: 0.16,
  },
  youMatterTextDesktop: {
    fontFamily: 'Caveat_700Bold',
    fontSize: 22,
    lineHeight: 24,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 14,
  },
  contentBody: {
    flex: 1,
  },
  contentBodyDesktop: { 
    paddingHorizontal: 36,
    paddingTop: spacing.xl,
  },
  contentBodyMobile: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.pill
  },
  progressFraction: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '700',
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadow.sm,
    minHeight: 440,
  },
  cardMobile: {
    minHeight: undefined,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  loadingArea: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    minHeight: 250 
  },
  loadingText: { 
    ...typography.body, 
    color: colors.textSecondary, 
    marginTop: spacing.md 
  },

  questionArea: {},
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  aiBadgeText: {
    ...typography.label,
    color: colors.primaryDark,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  // The actual AI-generated question is the headline itself, not a small
  // caption under a generic "Question X" label - matches the reference's
  // single big-bold-question treatment.
  mainTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subQuestionText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  optionsColumn: {
    flexDirection: 'column',
  },
  optionCard: {
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 20,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCardThird: {
    width: '31%',
  },
  optionCardHalf: {
    width: '48%',
  },
  optionCardDesktop: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  optionCardMobile: {
    paddingVertical: spacing.lg,
    minHeight: 100,
  },
  optionCardFull: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.md,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    ...shadow.sm,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconEmoji: {
    width: 28,
    height: 28,
  },
  // Small checkmark badge on the card's own top-right corner when an option
  // is selected - matches the reference design's mood-grid affordance
  // (badge sits on the card, not the emoji circle).
  selectedBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  optionCardText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 12,
    textAlign: 'center',
  },
  optionCardTextSelected: {
    color: colors.primaryDark,
  },
  textInput: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  // Supportive-line card - light lavender fill, a feather/leaf icon on the
  // left, italic reassurance text on the right.
  quoteCard: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    // A solid, more saturated lavender than the page background (which is
    // now the same base primaryLight tone) - the old alpha-blended version
    // barely showed up against a page that's the same color underneath it.
    backgroundColor: '#E4D9F7',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  quoteLeafIcon: {
    opacity: 0.85,
  },
  quoteLeafCluster: {
    position: 'absolute',
    bottom: -10,
    right: -6,
  },
  quoteText: {
    ...typography.body,
    color: colors.primaryDark,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  quoteAttribution: {
    ...typography.caption,
    color: colors.primary,
    marginTop: spacing.xs,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  voiceNoteRow: {
    marginBottom: spacing.sm,
  },
  voiceNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  voiceNoteBtnText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  voiceNoteRecording: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerLight,
  },
  voiceNoteRecordingText: {
    ...typography.bodySmall,
    color: colors.danger,
    fontWeight: '600',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  voiceTranscriptBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successLight,
  },
  voiceTranscriptText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  skipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skipBtnText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    ...shadow.sm,
  },
  nextBtnDisabled: { 
    opacity: 0.4 
  },
  nextBtnText: { 
    ...typography.bodyStrong, 
    color: colors.onPrimary,
    fontSize: 14,
  },
});