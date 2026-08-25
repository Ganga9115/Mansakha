import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Section from '../../components/Section';
import StatGrid from '../../components/StatGrid';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useCounsellorDashboard } from '../../services/hooks';

const TILES = [
  { key: 'total', label: 'Total Cases', color: colors.primary, icon: 'users' },
  { key: 'low', label: 'Low', color: colors.low, icon: 'check-circle' },
  { key: 'moderate', label: 'Moderate', color: colors.moderate, icon: 'alert-circle' },
  { key: 'high', label: 'High', color: colors.high, icon: 'alert-triangle' },
  { key: 'critical', label: 'Critical', color: colors.danger, icon: 'alert-octagon' },
];

// The distribution bars below the tiles compare risk-tier volume against the
// total - not a real time-series trend, since /api/counsellor/dashboard only
// returns current counts (see routes/counsellor.js), no history to chart one
// against.
const DISTRIBUTION_TILES = TILES.filter((t) => t.key !== 'total');

export default function CounsellorDashboardScreen({ navigation }) {
  const query = useCounsellorDashboard();

  return (
    <ScreenContainer>
      <QueryBoundary query={query}>
        {(data) => (
          <>
            <Section eyebrow="Overview" title="Your caseload">
              <StatGrid items={TILES.map((t) => ({ label: t.label, value: data[t.key], icon: t.icon, color: t.color }))} />
            </Section>

            <Section eyebrow="Breakdown" title="Risk distribution">
              <Card elevated>
                {DISTRIBUTION_TILES.map((tile) => {
                  const pct = data.total > 0 ? Math.round((data[tile.key] / data.total) * 100) : 0;
                  return (
                    <View key={tile.key} style={styles.barRow}>
                      <Text style={styles.barLabel}>{tile.label}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: tile.color }]} />
                      </View>
                      <Text style={styles.barValue}>{data[tile.key]}</Text>
                    </View>
                  );
                })}
              </Card>
            </Section>
          </>
        )}
      </QueryBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  barLabel: { ...typography.bodySmall, color: colors.textSecondary, width: 80 },
  barTrack: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surface, marginHorizontal: spacing.sm, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  barValue: { ...typography.bodyStrong, color: colors.textPrimary, width: 28, textAlign: 'right' },
});
