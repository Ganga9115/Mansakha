import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import { useToast } from '../../shared/context/ToastContext';
import { useCheckin, useUserDashboard, useUserHistory, useAppendInteraction } from '../../shared/services/hooks';
import { generateInteractiveQuestion, analyzeConversation, OPENING_GREETING } from '../../shared/services/ollamaClient';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';
import MenuButton from '../../shared/components/MenuButton';

const TOTAL_QUESTIONS = 5;

export default function CheckinScreen({ navigation }) {
  const toast = useToast();
  const dashboardQuery = useUserDashboard();
  const { tier, isDesktop } = useResponsive();

  const submitMutation = useCheckin();
  const historyQuery = useUserHistory();
  const appendInteraction = useAppendInteraction();
  const insets = useSafeAreaInsets();

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
    if (historyQuery.data?.history) {
      setPastContext(historyQuery.data.history);
    }
  }, [historyQuery.data]);

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
    
    appendInteraction.mutate(`Mansakha: ${currentQuestion.text}\nPerson: ${combinedAnswer}`, { onError: () => {} });
    
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

  // Dynamic helper to match icons for dynamic AI options using app theme colors
  const getOptionIcon = (opt) => {
    const lower = opt.toLowerCase();
    if (lower.includes('okay') || lower.includes('good') || lower === 'yes') return { name: 'smile', bg: colors.primaryLight, color: colors.primary };
    if (lower.includes('anxious') || lower.includes('sad') || lower === 'no') return { name: 'frown', bg: colors.warningLight, color: colors.warning };
    if (lower.includes('help') || lower.includes('support')) return { name: 'life-buoy', bg: colors.successLight, color: colors.success };
    if (lower.includes('other') || lower.includes('more')) return { name: 'more-horizontal', bg: colors.primaryLight, color: colors.primaryDark };
    return { name: 'check-circle', bg: colors.primaryLight, color: colors.textSecondary };
  };

  const isLongOptions = currentQuestion.options.some(opt => opt.length > 25);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Dynamic Header */}
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.md },
        ]}
      >
        <View style={styles.headerLeft}>
          {!isDesktop && <MenuButton />}
          {isDesktop ? (
            <Feather name="mic" size={24} color={colors.primaryDark} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              <Feather name="mic" size={24} color={colors.primary} />
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xxxl }}>
        <View
          style={[
            styles.contentBody,
            isDesktop && styles.contentBodyDesktop,
            { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' },
          ]}
        >
          {/* Progress Header */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTextRow}>
              <Text style={styles.progressLabel}>Question {responses.length + 1} of {TOTAL_QUESTIONS}</Text>
              <Text style={styles.progressPercent}>{Math.round(progressPercentage)}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPercentage}%` }]} />
            </View>
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
                {/* Header Row inside Card */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.aiBadge}>
                    <Feather name="sparkles" size={14} color={colors.primary} style={{ marginRight: spacing.xs }} />
                    <Text style={styles.aiBadgeText}>AI Companion</Text>
                  </View>

                  <View style={styles.botGraphicContainer}>
                    <View style={styles.botAvatarCircle}>
                      <Feather name="cpu" size={28} color={colors.primaryDark} />
                    </View>
                  </View>
                </View>
                
                <Text style={styles.mainTitle}>
                  {responses.length === 0 ? "Hello. I'm here to listen." : `Question ${responses.length + 1}`}
                </Text>
                <Text style={styles.subQuestionText}>{currentQuestion.text}</Text>

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
                          isLongOptions && styles.optionCardFull,
                          !isDesktop && styles.optionCardMobile,
                          isLongOptions && !isDesktop && styles.optionCardFullMobile,
                          isSelected && styles.optionCardSelected
                        ]}
                        onPress={() => toggleOption(opt)}
                      >
                        <View style={[styles.iconCircle, !isDesktop && styles.iconCircleMobile, { backgroundColor: iconInfo.bg }]}>
                          <Feather name={iconInfo.name} size={!isDesktop ? 16 : 20} color={iconInfo.color} />
                        </View>
                        <Text style={[styles.optionCardText, isSelected && styles.optionCardTextSelected]}>{opt}</Text>
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

                <View style={styles.divider} />

                {/* Card Actions */}
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.background 
  },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: 36, // 1 cm horizontal gap
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topHeaderDesktop: { 
    height: 64, 
    paddingTop: 0, 
    paddingBottom: 0, 
    alignItems: 'center' 
  },
  headerIconDesktop: { 
    marginRight: spacing.sm 
  },
  headerLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1 
  },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerInfo: { 
    flex: 1 
  },
  pageTitle: {
    ...typography.h1,
    color: colors.primaryDark,
  },
  headerRightRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: spacing.md 
  },
  
  contentBody: {
    flex: 1,
    paddingHorizontal: 36, // 1 cm horizontal gap
    paddingTop: spacing.xl,
  },
  contentBodyDesktop: { 
    marginTop: 0 
  },
  
  progressContainer: { 
    marginBottom: spacing.xl 
  },
  progressTextRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: spacing.xs 
  },
  progressLabel: { 
    ...typography.bodyStrong, 
    color: colors.textPrimary 
  },
  progressPercent: { 
    ...typography.bodySmall, 
    color: colors.textSecondary 
  },
  progressTrack: { 
    height: 6, 
    backgroundColor: colors.border, 
    borderRadius: radius.pill, 
    overflow: 'hidden' 
  },
  progressFill: { 
    height: '100%', 
    backgroundColor: colors.primary, 
    borderRadius: radius.pill 
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
  // No fixed minHeight on mobile - a short question with few options
  // shouldn't be forced to leave a huge blank area below it, and a long one
  // with many options should be free to grow as tall as it needs to since
  // the screen around it now actually scrolls (see the ScrollView above).
  cardMobile: {
    minHeight: undefined,
    padding: spacing.lg,
  },
  loadingArea: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    minHeight: 300 
  },
  loadingText: { 
    ...typography.body, 
    color: colors.textSecondary, 
    marginTop: spacing.md 
  },

  questionArea: { 
    flex: 1 
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  aiBadgeText: { 
    ...typography.label, 
    color: colors.primaryDark, 
    fontSize: 12 
  },
  botGraphicContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  botAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  subQuestionText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  optionsColumn: {
    flexDirection: 'column',
  },
  optionCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Smaller, tighter option cards on mobile - two per row still fit
  // comfortably, and a screenful of long, single-column options (see
  // optionCardFullMobile) no longer eats the whole viewport height.
  optionCardMobile: {
    minWidth: 100,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  optionCardFull: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingVertical: spacing.md,
  },
  optionCardFullMobile: {
    paddingVertical: spacing.sm,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconCircleMobile: {
    width: 30,
    height: 30,
    marginBottom: spacing.xs,
  },
  optionCardText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
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
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipBtn: { 
    paddingVertical: spacing.sm 
  },
  skipBtnText: { 
    ...typography.bodySmall, 
    color: colors.textSecondary, 
    textDecorationLine: 'underline' 
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  nextBtnDisabled: { 
    opacity: 0.4 
  },
  nextBtnText: { 
    ...typography.bodyStrong, 
    color: colors.onPrimary 
  },
});