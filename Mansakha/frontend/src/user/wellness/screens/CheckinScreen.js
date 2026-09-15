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
import { generateInteractiveQuestion, analyzeConversation, OPENING_GREETING, SECOND_QUESTION } from '../../shared/services/ollamaClient';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';
import BottomNavBar from '../../shared/components/BottomNavBar';

const TOTAL_QUESTIONS = 15;

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

  useEffect(() => {
    if (historyQuery.data?.history) {
      setPastContext(historyQuery.data.history);
    }
  }, [historyQuery.data]);

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
    } catch (err) {
      toast.error('Ollama is offline or slow. Using a fallback question so you can continue.');
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
    } else if (newHistory.length === 1) {
      // Question 2 is fixed and identical for every user, same as question 1
      // (OPENING_GREETING) - no AI/fallback call, no case-type branching yet.
      // Adaptive, case-aware questions only start from question 3 onward.
      setCurrentQuestion(SECOND_QUESTION);
      setSelectedOptions([]);
      setDraft('');
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

        <ScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={{ 
            flexGrow: 1, 
            paddingBottom: !isDesktop ? 140 : spacing.xxxl, // Generous scroll space for BottomNavBar
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.contentBody,
              isDesktop ? styles.contentBodyDesktop : styles.contentBodyMobile,
              { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' },
            ]}
          >
            {/* Progress Header */}
            <View style={styles.progressContainer}>
              <View style={styles.progressTextRow}>
                <Text style={styles.progressLabel}>Question {Math.min(responses.length + 1, TOTAL_QUESTIONS)} of {TOTAL_QUESTIONS}</Text>
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
                      <Text style={styles.aiBadgeText}>AI COMPANION</Text>
                    </View>

                    <View style={styles.botGraphicContainer}>
                      <View style={styles.botAvatarCircle}>
                        <Feather name="cpu" size={22} color={colors.primaryDark} />
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
                            isSelected && styles.optionCardSelected
                          ]}
                          onPress={() => toggleOption(opt)}
                        >
                          <View style={[styles.iconCircle, { backgroundColor: iconInfo.bg }]}>
                            <Feather name={iconInfo.name} size={18} color={iconInfo.color} />
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
      {!isDesktop && <BottomNavBar currentTab="CheckIn" navigation={navigation} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    marginBottom: spacing.md 
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  aiBadgeText: { 
    ...typography.label, 
    color: colors.primaryDark, 
    fontSize: 11,
    letterSpacing: 0.5,
  },
  botGraphicContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botAvatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 18,
    marginBottom: 2,
  },
  subQuestionText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
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
    width: '48%',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCardMobile: {
    paddingVertical: spacing.md,
    minHeight: 90,
  },
  optionCardFull: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.md,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  optionCardText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    fontSize: 13,
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  skipBtn: { 
    paddingVertical: spacing.sm,
  },
  skipBtnText: { 
    ...typography.bodySmall, 
    color: colors.textSecondary, 
    textDecorationLine: 'underline',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
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