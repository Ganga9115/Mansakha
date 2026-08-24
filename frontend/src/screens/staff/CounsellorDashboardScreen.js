import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <QueryBoundary query={query}>
        {(data) => (
          <>
            <View style={styles.grid}>
              {TILES.map((tile) => (
                <Card key={tile.key} elevated style={styles.tile}>
                  <View style={[styles.iconTile, { backgroundColor: `${tile.color}1A` }]}>
                    <Feather name={tile.icon} size={20} color={tile.color} />
                  </View>
                  <Text style={[styles.count, { color: tile.color }]}>{data[tile.key]}</Text>
                  <Text style={styles.label}>{tile.label}</Text>
                </Card>
              ))}
            </View>

            <Card elevated>
              <Text style={styles.sectionTitle}>Risk distribution</Text>
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
          </>
        )}
      </QueryBoundary>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: 150, alignItems: 'center' },
  iconTile: {
    width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  count: { ...typography.display, fontSize: 30 },
  label: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  barLabel: { ...typography.bodySmall, color: colors.textSecondary, width: 80 },
  barTrack: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surface, marginHorizontal: spacing.sm, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  barValue: { ...typography.bodyStrong, color: colors.textPrimary, width: 28, textAlign: 'right' },
});
