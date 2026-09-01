import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import { useToast } from '../../shared/context/ToastContext';
import { useCheckin, useUserDashboard } from '../../shared/services/hooks';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateInteractiveQuestion, analyzeConversation, OPENING_GREETING } from '../../shared/services/ollamaClient';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';

const TOTAL_QUESTIONS = 5;

export default function CheckinScreen({ navigation }) {
  const toast = useToast();
  const dashboardQuery = useUserDashboard();
  const { tier, isDesktop } = useResponsive();

  const submitMutation = useCheckin();

  const [responses, setResponses] = useState([]); // Array of { q, a }
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

  useEffect(() => {
    async function fetchHistory() {
      try {
        const token = await AsyncStorage.getItem('user_jwt');
        if (!token) return;
        const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'}/api/user/history`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.data?.history) {
          setPastContext(data.data.history);
        }
      } catch (e) {
        console.warn('Failed to load history', e);
      }
    }
    fetchHistory();
  }, []);

const FALLBACK_QUESTIONS = [
  "Take your time. Can you tell me a little more about how you're feeling?",
  "I'm here to listen. What else is on your mind?",
  "Is there anything else you'd like to share today?",
  "How has everything been affecting your daily life?",
  "Are you receiving any support from family, friends, or your community right now?"
];

  const loadNextQuestion = async (history) => {
    setLoading(true);
    try {
      const conversation = [];
      for (const item of history) {
        conversation.push({ role: 'assistant', content: item.q });
        conversation.push({ role: 'user', content: item.a });
      }

      const nextQ = await generateInteractiveQuestion(conversation, pastContext);
      setCurrentQuestion({
        text: nextQ.question,
        type: nextQ.type || 'single',
        options: nextQ.options || ['Yes', 'No']
      });
      setSelectedOptions([]);
      setDraft('');
    } catch (err) {
      toast.error('Ollama is offline or slow. Using a fallback question so you can continue.');
      const fallbackQ = FALLBACK_QUESTIONS[history.length % FALLBACK_QUESTIONS.length];
      setCurrentQuestion({
        text: fallbackQ,
        type: 'single',
        options: ['Yes', 'No', 'A little bit', 'Other...']
      });
      setSelectedOptions([]);
      setDraft('');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async (isSkipped = false) => {
    if (loading || submitting || isFinished || responses.length >= TOTAL_QUESTIONS) return;

    const isOtherSelected = selectedOptions.includes('Other...');
    const combinedAnswer = isSkipped ? "Skipped." : 
      (selectedOptions.filter(o => o !== 'Other...').join(', ') + (isOtherSelected && draft.trim() ? (selectedOptions.length > 1 ? ', ' : '') + draft.trim() : ''));
      
    if (!isSkipped && !combinedAnswer) return;
    
    const newHistory = [...responses, { q: currentQuestion.text, a: combinedAnswer }];
    setResponses(newHistory);
    
    // Async save
    try {
      const token = await AsyncStorage.getItem('user_jwt');
      if (token) {
        fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'}/api/user/interaction/append`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: `Mansakha: ${currentQuestion.text}\nPerson: ${combinedAnswer}` })
        }).catch(() => {});
      }
    } catch(e) {}
    
    if (newHistory.length >= TOTAL_QUESTIONS) {
      setIsFinished(true);
      await handleSubmit(newHistory);
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
        aiAnalysis 
      });
      
      navigation.navigate('CheckinConfirmation', {
        riskLevel: result.riskLevel,
        summary: result.summary,
        alertTriggered: result.alertTriggered,
      });
    } catch (err) {
      toast.error(err.message || 'Could not submit your check-in.');
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
            <Feather name="mic" size={24} color={colors.primaryDark} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              <Feather name="mic" size={28} color={colors.primary} />
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.pageTitle}>Check-in</Text>
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
                
                <Text style={styles.questionText}>{currentQuestion.text}</Text>

                <View style={styles.optionsContainer}>
                  {currentQuestion.options.map((opt, i) => {
                    const isSelected = selectedOptions.includes(opt);
                    return (
                      <Pressable 
                        key={i} 
                        style={[styles.optionChip, isSelected && styles.optionChipSelected]}
                        onPress={() => toggleOption(opt)}
                      >
                        <Text style={[styles.optionChipText, isSelected && styles.optionChipTextSelected]}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {selectedOptions.includes('Other...') && (
                  <TextInput
                    style={[styles.textInput, { marginTop: spacing.md }]}
                    placeholder="Type your own answer here..."
                    placeholderTextColor={colors.textSecondary}
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    numberOfLines={3}
                    autoFocus
                  />
                )}

                <View style={styles.actionRow}>
                  <Pressable style={styles.skipBtn} onPress={() => handleNext(true)}>
                    <Text style={styles.skipBtnText}>
                      {responses.length === TOTAL_QUESTIONS - 1 ? 'Skip & Submit' : 'Skip Question'}
                    </Text>
                  </Pressable>
                  <Pressable 
                    style={[styles.nextBtn, (!selectedOptions.length) && styles.nextBtnDisabled]} 
                    onPress={() => handleNext(false)}
                    disabled={!selectedOptions.length}
                  >
                    <Text style={styles.nextBtnText}>
                      {responses.length === TOTAL_QUESTIONS - 1 ? 'Finish & Submit' : 'Next'}
                    </Text>
                    {responses.length === TOTAL_QUESTIONS - 1 ? (
                      <Feather name="check" size={18} color={colors.white} style={{ marginLeft: spacing.xs }} />
                    ) : (
                      <Feather name="arrow-right" size={18} color={colors.white} style={{ marginLeft: spacing.xs }} />
                    )}
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
  pageTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 24, fontWeight: '700' },
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
  questionText: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
    lineHeight: 28,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  optionChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  optionChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionChipText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  optionChipTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
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
