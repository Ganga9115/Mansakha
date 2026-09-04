import React, { useState, useEffect } from 'react';
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
import { useCheckin, useUserDashboard, useUserHistory, useAppendInteraction } from '../../shared/services/hooks';
import { generateInteractiveQuestion, analyzeConversation, OPENING_GREETING } from '../../shared/services/ollamaClient';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';

const TOTAL_QUESTIONS = 5;

export default function CheckinScreen({ navigation }) {
  const toast = useToast();
  const dashboardQuery = useUserDashboard();
  const { tier, isDesktop } = useResponsive();

  const submitMutation = useCheckin();
  const historyQuery = useUserHistory();
  const appendInteraction = useAppendInteraction();

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

  // Dynamic helper to match icons for dynamic AI options
  const getOptionIcon = (opt) => {
    const lower = opt.toLowerCase();
    if (lower.includes('okay') || lower.includes('good') || lower === 'yes') return { name: 'smile', bg: '#EBF5FF', color: '#3B82F6' };
    if (lower.includes('anxious') || lower.includes('sad') || lower === 'no') return { name: 'frown', bg: '#FEF3C7', color: '#D97706' };
    if (lower.includes('help') || lower.includes('support')) return { name: 'life-buoy', bg: '#D1FAE5', color: '#059669' };
    if (lower.includes('other') || lower.includes('more')) return { name: 'more-horizontal', bg: '#F3E8FF', color: '#8B5CF6' };
    return { name: 'check-circle', bg: '#F1F5F9', color: '#64748B' };
  };

  // Check if options are long text to adapt layout dynamically
  const isLongOptions = currentQuestion.options.some(opt => opt.length > 25);

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
            {isDesktop && <Text style={styles.subtext}>A safe space to share and be heard.</Text>}
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

      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xl }}>
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
                {/* Header Row inside Card */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.aiBadge}>
                    <Feather name="sparkles" size={14} color="#4F46E5" style={{ marginRight: spacing.xs }} />
                    <Text style={styles.aiBadgeText}>AI Companion</Text>
                  </View>

                  <View style={styles.botGraphicContainer}>
                    <View style={styles.botAvatarCircle}>
                      <Feather name="cpu" size={32} color="#2563EB" />
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
                          isSelected && styles.optionCardSelected
                        ]}
                        onPress={() => toggleOption(opt)}
                      >
                        <View style={[styles.iconCircle, { backgroundColor: iconInfo.bg }]}>
                          <Feather name={iconInfo.name} size={22} color={iconInfo.color} />
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
                      color={colors.white} 
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  topHeader: {
    backgroundColor: '#FFFFFF',
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0, alignItems: 'center' },
  headerIconDesktop: { marginRight: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headerInfo: { flex: 1 },
  pageTitle: { ...typography.h1, color: '#1E293B', fontSize: 22, fontWeight: '700' },
  subtext: { ...typography.caption, color: '#64748B', marginTop: 2 },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  
  contentBody: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  contentBodyDesktop: { marginTop: 0 },
  
  progressContainer: { marginBottom: spacing.xl },
  progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  progressLabel: { ...typography.bodyStrong, color: '#334155', fontWeight: '600' },
  progressPercent: { ...typography.body, color: '#94A3B8', fontSize: 13 },
  progressTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: radius.pill },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 32,
    ...shadow.card,
    minHeight: 440,
  },
  loadingArea: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  loadingText: { ...typography.body, color: '#64748B', marginTop: spacing.md },

  questionArea: { flex: 1 },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  aiBadgeText: { ...typography.caption, color: '#4F46E5', fontWeight: '600', fontSize: 13 },
  botGraphicContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
  },
  botAvatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  subQuestionText: {
    fontSize: 15,
    color: '#64748B',
    marginBottom: 28,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
  },
  optionsColumn: {
    flexDirection: 'column',
  },
  optionCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCardFull: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingVertical: 14,
  },
  optionCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#F0F6FF',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  optionCardText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    textAlign: 'center',
  },
  optionCardTextSelected: {
    color: '#2563EB',
    fontWeight: '600',
  },
  textInput: {
    ...typography.body,
    color: '#0F172A',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    padding: spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipBtn: { paddingVertical: spacing.sm },
  skipBtnText: { fontSize: 14, color: '#64748B', textDecorationLine: 'underline' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 15, fontWeight: '600', color: colors.white },
});