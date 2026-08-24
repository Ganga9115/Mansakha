import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import RiskBadge from '../../components/RiskBadge';
import { QueryBoundary } from '../../components/QueryStates';
import { useDistressHistory } from '../../services/hooks';

// Same risk -> color mapping RiskBadge uses internally (not exported from
// there, so mirrored here for the bar chart).
const RISK_COLOR = { Low: colors.low, Moderate: colors.moderate, High: colors.high, Critical: colors.danger };
const LEGEND = [
  { label: 'Low', color: colors.low },
  { label: 'Moderate', color: colors.moderate },
  { label: 'High', color: colors.high },
  { label: 'Critical', color: colors.danger },
];

const MAX_BAR_HEIGHT = 100; // px - score_value is clamped 0-100 server-side
const MIN_BAR_HEIGHT = 4;   // keep a sliver visible even for a 0 score
const MAX_BARS = 14;        // cap so bars stay readable instead of hairline-thin

// Plain flexbox bar chart - no charting library installed/added, per the tech
// stack constraint. Scores arrive ordered oldest-first from the API, so this
// reads left-to-right as a chronological trend.
function TrendChart({ scores }) {
  const recent = scores.slice(-MAX_BARS);
  const first = recent[0];
  const last = recent[recent.length - 1];

  return (
    <Card elevated style={styles.chartCard}>
      <View style={styles.chartHeaderRow}>
        <Feather name="bar-chart-2" size={18} color={colors.primary} />
        <Text style={styles.chartTitle}>Distress trend</Text>
      </View>

      <View style={[styles.chartArea, recent.length === 1 && styles.chartAreaSingle]}>
        {recent.map((item, i) => (
          <View
            key={`${item.computedAt}-${i}`}
            style={[
              styles.bar,
              {
                height: Math.max((item.score / 100) * MAX_BAR_HEIGHT, MIN_BAR_HEIGHT),
                backgroundColor: RISK_COLOR[item.riskLevel] || colors.textSecondary,
              },
            ]}
          />
        ))}
      </View>

      {first && last && first !== last && (
        <View style={styles.chartAxisRow}>
          <Text style={styles.axisLabel}>{new Date(first.computedAt).toLocaleDateString()}</Text>
          <Text style={styles.axisLabel}>{new Date(last.computedAt).toLocaleDateString()}</Text>
        </View>
      )}

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

  return (
    <View style={styles.container}>
      <QueryBoundary query={query} empty={(data) => !data?.scores?.length}>
        {(data) => (
          <FlatList
            data={data.scores}
            keyExtractor={(item, index) => `${item.computedAt}-${index}`}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<TrendChart scores={data.scores} />}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.rowDateWrap}>
                  <Feather name="calendar" size={14} color={colors.textSecondary} />
                  <View style={styles.rowDateText}>
                    <Text style={styles.date}>{new Date(item.computedAt).toLocaleDateString()}</Text>
                    <Text style={styles.score}>Score: {item.score}</Text>
                  </View>
                </View>
                <RiskBadge riskLevel={item.riskLevel} />
              </View>
            )}
          />
        )}
      </QueryBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  chartCard: { marginBottom: spacing.lg },
  chartHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  chartTitle: { ...typography.label, color: colors.textSecondary, textTransform: 'uppercase', marginLeft: spacing.sm },
  chartArea: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    height: MAX_BAR_HEIGHT, paddingHorizontal: spacing.xs,
  },
  chartAreaSingle: { justifyContent: 'center' },
  bar: { width: 12, borderRadius: radius.sm, marginHorizontal: 2 },
  chartAxisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  axisLabel: { ...typography.caption, color: colors.textSecondary },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.md, marginTop: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: radius.pill, marginRight: spacing.xs },
  legendText: { ...typography.caption, color: colors.textSecondary },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  rowDateWrap: { flexDirection: 'row', alignItems: 'center' },
  rowDateText: { marginLeft: spacing.sm },
  date: { ...typography.bodySmall, color: colors.textSecondary },
  score: { ...typography.bodyStrong, color: colors.textPrimary },
});
