import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { useCheckin } from '../../services/hooks';
import IconInput from '../../components/IconInput';
import Button from '../../components/Button';

// Section 4.1's sample conversational prompts, translated via LanguageContext
// (the Victim App's chosen UI language - see LanguageSelectScreen). Real TTS
// playback per prompt is a Section 9 accessibility REQUIREMENT ("TTS
// playback of any on-screen prompt"), not optional - built here with
// expo-speech. Voice INPUT (recording + transcription) is a bigger lift than
// TTS output and isn't built in this pass - text input is the fully-working
// path; that's a real gap, flagged as leftover, not silently skipped.

// Minimal adaptive step, not a full branching questionnaire: a fixed
// client-side keyword check (not a live AI call - that's the real scoring
// pipeline's job, server-side, after submit) that surfaces one extra
// targeted prompt when a response suggests something specific is going on,
// instead of always exactly three fixed questions regardless of content.
// English-only keyword list - a real limitation once the prompts themselves
// are multilingual (a Hindi/Bengali/etc. response won't trip this heuristic
// today), flagged rather than silently assumed to work in every language.
const DISTRESS_KEYWORDS = [
  'afraid', 'scared', 'threat', 'unsafe', 'hurt', 'hopeless', "can't sleep",
  'cannot sleep', 'crying', 'alone', 'no one', 'give up', 'harm', 'panic',
  'anxious', 'anxiety', 'terrified', 'nightmare', 'unsafe',
];

function hasDistressSignal(texts) {
  const combined = texts.join(' ').toLowerCase();
  return DISTRESS_KEYWORDS.some((kw) => combined.includes(kw));
}

export default function CheckinScreen({ navigation }) {
  const { t } = useLanguage();
  const PROMPTS = [t('prompt1'), t('prompt2'), t('prompt3')];
  const [responses, setResponses] = useState(PROMPTS.map(() => ''));
  const [followUpResponse, setFollowUpResponse] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const checkin = useCheckin();
  const toast = useToast();

  const updateResponse = (index, text) => {
    setResponses((prev) => {
      const next = prev.map((r, i) => (i === index ? text : r));
      // Sticky once triggered - don't hide the follow-up again if they edit
      // an earlier answer back to something milder mid-way through.
      if (!showFollowUp && hasDistressSignal(next)) setShowFollowUp(true);
      return next;
    });
    if (fieldErrors[index]) setFieldErrors((prev) => ({ ...prev, [index]: undefined }));
  };

  const speak = (text) => Speech.speak(text);
  const followUpPrompt = t('followUpPrompt');

  const handleSubmit = async () => {
    const errors = {};
    responses.forEach((r, i) => {
      if (r.trim().length === 0) errors[i] = t('answerRequired');
    });
    if (showFollowUp && followUpResponse.trim().length === 0) errors.followUp = t('answerRequired');
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    const allResponses = showFollowUp ? [...responses, followUpResponse] : responses;
    try {
      const result = await checkin.mutateAsync({ channel: 'Mobile App', responses: allResponses });
      navigation.navigate('CheckinConfirmation', { alertTriggered: result.alertTriggered });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('checkinTitle')}</Text>
      {PROMPTS.map((prompt, index) => (
        <View key={prompt} style={styles.promptBlock}>
          <View style={styles.promptRow}>
            <Text style={styles.prompt}>{prompt}</Text>
            <Pressable onPress={() => speak(prompt)} style={styles.speakButton} accessibilityLabel="Listen to this question">
              <Feather name="volume-2" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <IconInput
            icon="edit-3"
            value={responses[index]}
            onChangeText={(text) => updateResponse(index, text)}
            multiline
            numberOfLines={3}
            placeholder={t('answerPlaceholder')}
            error={fieldErrors[index]}
          />
        </View>
      ))}

      {showFollowUp && (
        <View style={styles.promptBlock}>
          <View style={styles.promptRow}>
            <Text style={styles.prompt}>{followUpPrompt}</Text>
            <Pressable onPress={() => speak(followUpPrompt)} style={styles.speakButton} accessibilityLabel="Listen to this question">
              <Feather name="volume-2" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <IconInput
            icon="edit-3"
            value={followUpResponse}
            onChangeText={setFollowUpResponse}
            multiline
            numberOfLines={3}
            placeholder={t('answerPlaceholder')}
            error={fieldErrors.followUp}
          />
        </View>
      )}

      <Button
        title={t('submitCheckin')}
        icon="check"
        onPress={handleSubmit}
        loading={checkin.isPending}
        style={styles.submitButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.lg },
  promptBlock: { marginBottom: spacing.lg },
  promptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  prompt: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
  speakButton: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm,
  },
  submitButton: { marginTop: spacing.sm },
});
