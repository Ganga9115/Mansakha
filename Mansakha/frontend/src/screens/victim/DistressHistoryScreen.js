import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import Card from '../../components/Card';
import RiskBadge from '../../components/RiskBadge';
import { QueryBoundary } from '../../components/QueryStates';
import { useDistressHistory } from '../../services/hooks';

const RISK_COLOR = {
  Low: colors.success,
  Moderate: colors.warning,
  High: colors.error,
  Critical: colors.error,
};

const LEGEND = [
  { label: 'Low', color: colors.success },
  { label: 'Moderate', color: colors.warning },
  { label: 'High', color: colors.error },
  { label: 'Critical', color: colors.error },
];

const MAX_BAR_HEIGHT = 100;
const MIN_BAR_HEIGHT = 6;
const MAX_BARS = 14;

function TrendChart({ scores }) {
  const recent = scores.slice(-MAX_BARS);
  const first = recent[0];
  const last = recent[recent.length - 1];

  return (
    <Card style={styles.chartCard}>
      <View style={styles.chartHeaderRow}>
        <View style={styles.headerIconCircle}>
          <Feather name="bar-chart-2" size={18} color={colors.primary} />
        </View>
        <Text style={styles.chartTitle}>Distress Trend</Text>
      </View>

      <View style={[styles.chartArea, recent.length === 1 && styles.chartAreaSingle]}>
        {recent.map((item, i) => (
          <View key={`${item.computedAt}-${i}`} style={styles.barWrapper}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max((item.score / 100) * MAX_BAR_HEIGHT, MIN_BAR_HEIGHT),
                  backgroundColor: RISK_COLOR[item.riskLevel] || colors.textSecondary,
                },
              ]}
            />
          </View>
        ))}
      </View>

      {first && last && first !== last && (
        <View style={styles.chartAxisRow}>
          <Text style={styles.axisLabel}>{new Date(first.computedAt).toLocaleDateString()}</Text>
          <Text style={styles.axisLabel}>{new Date(last.computedAt).toLocaleDateString()}</Text>
        </View>
      )}

      <View style={styles.legendDivider} />

      <View style={styles.legendRow}>
        {LEGEND.map((l) => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: l.color }]} />
            <Text style={styles.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function DistressHistoryScreen() {
  const query = useDistressHistory();
  const today = new Date();
  const dayStr = `Day - ${String(today.getDate()).padStart(2, '0')}`;
  const monthStr = `Month - ${today.toLocaleString('default', { month: 'long' })}`;
  const yearStr = `Year - ${today.getFullYear()}`;

  return (
    <View style={styles.container}>
      {/* Top Profile Header */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarContainer}>
            <Feather name="trending-up" size={28} color={colors.primary} />
            <View style={styles.avatarEditBadge}>
              <Feather name="activity" size={10} color={colors.white} />
            </View>
          </View>

          <View style={styles.headerInfo}>
            <View style={styles.pillBadge}>
              <Text style={styles.pillText}>ANALYTICS</Text>
            </View>
            <Text style={styles.statusTitle}>My Well-being</Text>
            <Text style={styles.subtext}>Historical assessment records</Text>
          </View>
        </View>
      </View>

      {/* Main Content Body */}
      <View style={styles.contentBody}>
        <QueryBoundary query={query} empty={(data) => !data?.scores?.length}>
          {(data) => (
            <FlatList
              data={data.scores}
              keyExtractor={(item, index) => `${item.computedAt}-${index}`}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View>
                  {/* Date Ticker */}
                  <View style={styles.dateTicker}>
                    <Text style={styles.tickerText}>{dayStr}</Text>
                    <Text style={[styles.tickerText, styles.tickerTextActive]}>{monthStr}</Text>
                    <Text style={styles.tickerText}>{yearStr}</Text>
                  </View>

                  <TrendChart scores={data.scores} />
                  <Text style={styles.sectionHeaderTitle}>PAST ASSESSMENTS</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.rowCard}>
                  <View style={styles.rowDateWrap}>
                    <View style={styles.calendarCircle}>
                      <Feather name="calendar" size={16} color={colors.primary} />
                    </View>
                    <View style={styles.rowDateText}>
                      <Text style={styles.scoreText}>Score: {item.score}/100</Text>
                      <Text style={styles.dateText}>{new Date(item.computedAt).toLocaleDateString()}</Text>
                    </View>
                  </View>
                  <RiskBadge riskLevel={item.riskLevel} />
                </View>
              )}
            />
          )}
        </QueryBoundary>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
  },
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
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    padding: 3,
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
  contentBody: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  dateTicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  tickerText: { ...typography.bodyStrong, color: colors.primary },
  tickerTextActive: { color: colors.error },
  list: { paddingBottom: spacing.xxxl },
  sectionHeaderTitle: {
    ...typography.label,
    color: colors.primaryDark,
    marginBottom: spacing.md,
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  chartCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  chartHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  chartTitle: { ...typography.bodyStrong, color: colors.primary, fontSize: 13, letterSpacing: 0.5 },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: MAX_BAR_HEIGHT,
    paddingHorizontal: 4,
    marginBottom: spacing.xs,
  },
  chartAreaSingle: { justifyContent: 'center' },
  barWrapper: { flex: 1, alignItems: 'center' },
  bar: { width: 10, borderRadius: radius.pill },
  chartAxisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  axisLabel: { ...typography.caption, color: colors.textSecondary },
  legendDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: radius.pill, marginRight: spacing.xs },
  legendText: { ...typography.caption, color: colors.textSecondary, fontWeight: '500' },
  rowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  rowDateWrap: { flexDirection: 'row', alignItems: 'center' },
  calendarCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowDateText: { justifyContent: 'center' },
  scoreText: { ...typography.bodyStrong, color: colors.textPrimary },
  dateText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});