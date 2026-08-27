import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import { useToast } from '../../context/ToastContext';
import { useQuestionnaireNext, useQuestionnaireSubmit, useVictimDashboard } from '../../services/hooks';
import DesktopHeaderActions from '../../components/DesktopHeaderActions';
import TopRightActions from '../../components/TopRightActions';

const TOTAL_QUESTIONS = 15;

export default function CheckinScreen({ navigation }) {
  const toast = useToast();
  const dashboardQuery = useVictimDashboard();
  const { tier, isDesktop } = useResponsive();

  const nextMutation = useQuestionnaireNext();
  const submitMutation = useQuestionnaireSubmit();

  const [responses, setResponses] = useState([]); // Array of { q, a }
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // Initial load
  useEffect(() => {
    loadNextQuestion([]);
  }, []);

  const loadNextQuestion = async (history) => {
    setLoading(true);
    try {
      const result = await nextMutation.mutateAsync({
        currentQuestionIndex: history.length,
        previousResponses: history
      });
      setCurrentQuestion(result.question);
    } catch (err) {
      toast.error(err.message || 'Failed to load next question. Is Ollama running on backend?');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async (isSkipped = false) => {
    if (!isSkipped && !draft.trim()) return;
    
    const answer = isSkipped ? "Skipped." : draft.trim();
    const newHistory = [...responses, { q: currentQuestion, a: answer }];
    setResponses(newHistory);
    setDraft('');
    
    if (newHistory.length >= TOTAL_QUESTIONS) {
      setIsFinished(true);
      await handleSubmit(newHistory);
    } else {
      await loadNextQuestion(newHistory);
    }
  };

  const handleSubmit = async (finalResponses) => {
    setSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({ allResponses: finalResponses });
      navigation.navigate('CheckinConfirmation', {
        riskLevel: result.riskLevel,
        summary: result.summary,
        alertTriggered: result.alertTriggered,
      });
    } catch (err) {
      toast.error(err.message || 'Could not submit your check-in.');
      setIsFinished(false);
    } finally {
      setSubmitting(false);
    }
  };

  const progressPercentage = Math.min((responses.length / TOTAL_QUESTIONS) * 100, 100);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
        <View style={styles.headerLeft}>
          {isDesktop ? (
            <Feather name="activity" size={20} color={colors.primaryDark} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              <Feather name="activity" size={28} color={colors.primary} />
            </View>
          )}
          <View style={styles.headerInfo}>
            {!isDesktop && (
              <View style={styles.pillBadge}>
                <Text style={styles.pillText}>AI CHECK-IN</Text>
              </View>
            )}
            <Text style={styles.statusTitle}>Mansakha Care</Text>
            {!isDesktop && <Text style={styles.subtext}>A quick 15-question check-in</Text>}
          </View>
        </View>
        <View style={styles.headerRightRow}>
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

      <ScrollView contentContainerStyle={{flexGrow:1}}>
        <View
          style={[
            styles.contentBody,
            isDesktop && styles.contentBodyDesktop,
            { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' },
          ]}
        >
          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTextRow}>
              <Text style={styles.progressLabel}>Question {responses.length + 1} of {TOTAL_QUESTIONS}</Text>
              <Text style={styles.progressPercent}>{Math.round(progressPercentage)}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
            </View>
          </View>

          {/* Questionnaire Card */}
          <View style={styles.card}>
            {loading || submitting || isFinished ? (
              <View style={styles.loadingArea}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>
                  {submitting || isFinished ? "Analyzing your responses..." : "Mansakha is thinking..."}
                </Text>
              </View>
            ) : (
              <View style={styles.questionArea}>
                <View style={styles.aiBadge}>
                  <Feather name="cpu" size={16} color={colors.primaryDark} style={{ marginRight: spacing.xs }} />
                  <Text style={styles.aiBadgeText}>AI Companion</Text>
                </View>
                
                <Text style={styles.questionText}>{currentQuestion}</Text>

                <TextInput
                  style={styles.textInput}
                  placeholder="Type your answer here..."
                  placeholderTextColor={colors.textSecondary}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  numberOfLines={4}
                  autoFocus
                />

                <View style={styles.actionRow}>
                  <Pressable style={styles.skipBtn} onPress={() => handleNext(true)}>
                    <Text style={styles.skipBtnText}>Skip Question</Text>
                  </Pressable>
                  <Pressable 
                    style={[styles.nextBtn, !draft.trim() && styles.nextBtnDisabled]} 
                    onPress={() => handleNext(false)}
                    disabled={!draft.trim()}
                  >
                    <Text style={styles.nextBtnText}>Next</Text>
                    <Feather name="arrow-right" size={18} color={colors.white} style={{ marginLeft: spacing.xs }} />
                  </Pressable>
                </View>
              </View>
            )}
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0, alignItems: 'center' },
  headerIconDesktop: { marginRight: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  headerInfo: { flex: 1 },
  pillBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  pillText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  contentBody: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  contentBodyDesktop: { marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  
  progressContainer: { marginBottom: spacing.xl },
  progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  progressLabel: { ...typography.bodyStrong, color: colors.primaryDark },
  progressPercent: { ...typography.body, color: colors.textSecondary },
  progressTrack: { height: 8, backgroundColor: colors.border, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadow.card,
    minHeight: 400,
    justifyContent: 'center'
  },
  loadingArea: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },

  questionArea: { flex: 1, justifyContent: 'flex-start' },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    marginBottom: spacing.lg
  },
  aiBadgeText: { ...typography.caption, color: colors.primaryDark, fontWeight: '600' },
  questionText: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xl, lineHeight: 32 },
  
  textInput: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: spacing.xl
  },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto'
  },
  skipBtn: { padding: spacing.sm },
  skipBtnText: { ...typography.body, color: colors.textSecondary, textDecorationLine: 'underline' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    ...shadow.pop
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { ...typography.bodyStrong, color: colors.white }
});
