import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../../context/ToastContext';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import Card from '../../components/Card';
import SegmentedToggle from '../../components/SegmentedToggle';
import { QueryBoundary } from '../../components/QueryStates';
import { useWellnessSuggestions } from '../../services/hooks';

const SEGMENTS = [
  { value: 'exercise', label: 'Exercise', icon: 'activity' },
  { value: 'meditation', label: 'Meditation', icon: 'wind' },
  { value: 'music', label: 'Music', icon: 'music' },
];

const INHALE_MS = 4000;
const HOLD_MS = 2000;
const EXHALE_MS = 4000;

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
        <View style={{ gap: spacing.md }}>
          {data.suggestions.map((item) => (
            <Card key={item.contentId} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.iconTile}>
                  <Feather name={category === 'music' ? 'music' : 'activity'} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  {!!item.body && <Text style={styles.cardBody}>{item.body}</Text>}
                </View>
                {category === 'music' && item.url && (
                  <Pressable
                    onPress={() => Linking.openURL(item.url).catch(() => toast.error('Could not open that link.'))}
                    hitSlop={8}
                  >
                    <Feather name="external-link" size={16} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
            </Card>
          ))}
        </View>
      )}
    </QueryBoundary>
  );
}

export default function WellnessScreen({ navigation }) {
  const { tier, isDesktop } = useResponsive();
  const [segment, setSegment] = useState('exercise');

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      <View style={styles.topHeader}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.primaryDark} />
        </Pressable>
        <View style={styles.headerIconTile}>
          <Feather name="trending-up" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>My Well-being</Text>
          <Text style={styles.subtext}>Exercises, meditation & music, at your pace</Text>
        </View>
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        <Pressable style={styles.journalRow} onPress={() => navigation.navigate('Journal')}>
          <View style={styles.iconTile}>
            <Feather name="book-open" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>My Journal</Text>
            <Text style={styles.cardBody}>Write down how you're feeling, in your own words</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </Pressable>

        <SegmentedToggle options={SEGMENTS} value={segment} onChange={setSegment} />

        {segment === 'meditation' ? <BreathingTimer /> : <ContentList category={segment} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  body: { padding: spacing.lg },
  journalRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.lg, ...shadow.card,
  },
  card: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  iconTile: {
    width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  cardBody: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  timerWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
  breathCircleOuter: {
    width: 180, height: 180, borderRadius: 90, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  breathCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.primary },
  phaseText: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xl },
  primaryBtn: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xxl },
  primaryBtnText: { ...typography.bodyStrong, color: colors.white },
});
