import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../../shared/context/ToastContext';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { dashboardContentWidth } from '../../shared/theme/layout';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { useResponsive } from '../../shared/hooks/useResponsive';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useWellnessSuggestions, useUserDashboard } from '../../shared/services/hooks';
import JournalIllustration from '../../shared/components/JournalIllustration';

const SEGMENTS = [
  { value: 'exercise', label: 'Exercise', icon: 'activity' },
  { value: 'meditation', label: 'Meditation', icon: 'user' },
  { value: 'music', label: 'Music', icon: 'music' },
];

const INHALE_MS = 4000;
const HOLD_MS = 2000;
const EXHALE_MS = 4000;

function getExerciseIcon(title = '', category = '') {
  if (category === 'music') return 'music';
  if (category === 'meditation') return 'wind';
  
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('neck') || lowerTitle.includes('shoulder')) {
    return 'user';
  }
  if (lowerTitle.includes('walk') || lowerTitle.includes('step')) {
    return 'navigation';
  }
  if (lowerTitle.includes('muscle') || lowerTitle.includes('relaxation') || lowerTitle.includes('stretch')) {
    return 'smile';
  }
  return 'activity';
}

function BreathingTimer() {
  const scale = useRef(new Animated.Value(1)).current;
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('Ready');

  useEffect(() => {
    if (!running) {
      scale.stopAnimation();
      scale.setValue(1);
      setPhase('Ready');
      return undefined;
    }

    let cancelled = false;
    let holdTimeout = null;

    const runCycle = () => {
      if (cancelled) return;
      setPhase('Inhale');
      Animated.timing(scale, { toValue: 1.4, duration: INHALE_MS, useNativeDriver: true }).start(({ finished }) => {
        if (!finished || cancelled) return;
        setPhase('Hold');
        holdTimeout = setTimeout(() => {
          if (cancelled) return;
          setPhase('Exhale');
          Animated.timing(scale, { toValue: 1, duration: EXHALE_MS, useNativeDriver: true }).start(({ finished: doneExhale }) => {
            if (doneExhale && !cancelled) runCycle();
          });
        }, HOLD_MS);
      });
    };
    runCycle();

    return () => {
      cancelled = true;
      if (holdTimeout) clearTimeout(holdTimeout);
      scale.stopAnimation();
    };
  }, [running]);

  return (
    <View style={styles.timerWrap}>
      <View style={styles.breathCircleOuter}>
        <Animated.View style={[styles.breathCircle, { transform: [{ scale }] }]} />
      </View>
      <Text style={styles.phaseText}>{phase}</Text>
      <Pressable style={styles.primaryBtn} onPress={() => setRunning((r) => !r)}>
        <Text style={styles.primaryBtnText}>{running ? 'Stop' : 'Start Breathing Exercise'}</Text>
      </Pressable>
    </View>
  );
}

function ContentList({ category }) {
  const query = useWellnessSuggestions(category);
  const toast = useToast();

  return (
    <QueryBoundary query={query} empty={(d) => !d?.suggestions?.length}>
      {(data) => (
        <View style={styles.contentListGap}>
          {data.suggestions.map((item) => {
            const iconName = getExerciseIcon(item.title, category);

            return (
              <Pressable
                key={item.contentId}
                style={styles.contentCard}
                onPress={() => {
                  if (item.url) {
                    Linking.openURL(item.url).catch(() => toast.error('Could not open link.'));
                  }
                }}
              >
                <View style={styles.cardMainRow}>
                  <View style={styles.itemIconTile}>
                    <Feather name={iconName} size={22} color={colors.primary} />
                  </View>

                  <View style={styles.itemTextContainer}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {!!item.body && <Text style={styles.itemBody}>{item.body}</Text>}
                  </View>

                  {item.duration && (
                    <View style={styles.durationRow}>
                      <Feather name="clock" size={14} color={colors.textSecondary} />
                      <Text style={styles.durationText}>{item.duration}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </QueryBoundary>
  );
}

export default function WellnessScreen({ navigation }) {
  const { tier, isDesktop } = useResponsive();
  const [segment, setSegment] = useState('exercise');
  
  // Fetch user profile data just like HomeScreen does
  const dashboardQuery = useUserDashboard();
  const userData = dashboardQuery.data;

  return (
    <View style={styles.screen}>
      {/* Top Header */}
      <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.primaryDark} />
          </Pressable>

          <View style={styles.headerIconTile}>
            <Feather name="trending-up" size={18} color={colors.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>My Well-being</Text>
            <Text style={styles.subtext}>Your emotional wellbeing toolkit</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions
              fullName={userData?.fullName}
              alertCount={userData?.alerts?.length || 0}
              onBellPress={() => {}}
              showNotifications
            />
          ) : (
            <TopRightActions showNotifications />
          )}
        </View>
      </View>

      <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={[styles.body, { maxWidth: dashboardContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
          {/* Hero Journal Card with Illustration */}
          <Pressable style={styles.journalBanner} onPress={() => navigation?.navigate('Journal')}>
            <View style={styles.journalIconTile}>
              <Feather name="book-open" size={22} color={colors.primary} />
            </View>

            <View style={styles.journalTextContainer}>
              <Text style={styles.journalTitle}>My Journal</Text>
              <Text style={styles.journalSubtext}>Write down how you're feeling, in your own words</Text>
            </View>

            {/* Banner Illustration */}
            <View style={styles.illustrationWrap}>
              <JournalIllustration width={130} height={85} />
            </View>

            <View style={styles.journalChevronBtn}>
              <Feather name="chevron-right" size={16} color={colors.white} />
            </View>
          </Pressable>

          {/* Underlined Segment Tabs */}
          <View style={styles.tabsContainer}>
            {SEGMENTS.map((tab) => {
              const isActive = segment === tab.value;
              return (
                <Pressable
                  key={tab.value}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  onPress={() => setSegment(tab.value)}
                >
                  <Feather
                    name={tab.icon}
                    size={16}
                    color={isActive ? colors.primary : colors.textSecondary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Tab Content */}
          {segment === 'meditation' ? <BreathingTimer /> : <ContentList category={segment} />}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topHeaderDesktop: {
    height: 64,
    paddingTop: 0,
    paddingBottom: 0,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerRight: { marginLeft: spacing.md },
  backBtn: { marginRight: spacing.md, padding: spacing.xs },
  headerIconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark, fontWeight: '700' },
  subtext: { ...typography.caption, color: colors.textSecondary },
  body: { padding: spacing.xl },

  /* Journal Card Header */
  journalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: spacing.xl,
    position: 'relative',
    overflow: 'hidden',
    ...shadow.card,
  },
  journalIconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  journalTextContainer: { flex: 1, zIndex: 2 },
  journalTitle: { ...typography.h3, color: colors.primaryDark, fontWeight: '700', fontSize: 18 },
  journalSubtext: { ...typography.caption, color: colors.textSecondary, marginTop: 4, fontSize: 13, maxWidth: '85%' },
  illustrationWrap: {
    marginRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  journalChevronBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  /* Underline Tab Navigation */
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xl,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: spacing.lg,
  },
  tabButtonActive: {
    borderBottomColor: colors.primary,
  },
  tabLabel: { ...typography.bodyStrong, color: colors.textSecondary, fontSize: 14 },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },

  /* Content Cards */
  contentListGap: { gap: spacing.lg },
  contentCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardMainRow: { flexDirection: 'row', alignItems: 'center' },
  itemIconTile: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight + '80',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  itemTextContainer: { flex: 1, paddingRight: spacing.md },
  itemTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  itemBody: { ...typography.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 18, fontSize: 12 },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationText: { ...typography.caption, color: colors.textSecondary, fontSize: 12, fontWeight: '500' },

  /* Breathing Timer */
  timerWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
  breathCircleOuter: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  breathCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.primary },
  phaseText: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xl },
  primaryBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  primaryBtnText: { ...typography.bodyStrong, color: colors.white },
});