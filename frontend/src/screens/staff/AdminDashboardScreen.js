import React from 'react';
import { View, Text, FlatList, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import RiskBadge from '../../components/RiskBadge';
import { QueryBoundary } from '../../components/QueryStates';
import { useAdminDashboard, useRootJurisdiction } from '../../services/hooks';
import { useStaffScope } from '../../context/StaffScopeContext';
import { LoadingState, ErrorState } from '../../components/QueryStates';

const TILES = [
  { key: 'total', label: 'Total Cases', icon: 'users', color: colors.primary },
  { key: 'vulnerable', label: 'Vulnerable (Moderate)', icon: 'alert-circle', color: colors.moderate },
  { key: 'highRisk', label: 'High Risk', icon: 'alert-triangle', color: colors.high },
  { key: 'critical', label: 'Critical', icon: 'alert-octagon', color: colors.danger },
];

// Handles District/State/National uniformly - Section 4.5: each tier has a
// genuinely different default view, not the same dashboard with a filter. The
// backend response shape already encodes that (`tier`, and `cases` vs `trends`),
// this screen just renders whichever shape came back. Reused by Ministry's
// National Dashboard too (same component, unrestricted access via that role).
export default function AdminDashboardScreen({ navigation, route }) {
  const scope = useStaffScope();
  // Ministry's own role has jurisdictionId: null (unrestricted) - resolve the
  // National root as the "home" view in that case, unless a route param
  // (drill-down, or a specific jurisdiction) already specifies one.
  const needsRoot = !route.params?.jurisdictionId && !scope.jurisdictionId;
  const rootQuery = useRootJurisdiction(needsRoot);
  const jurisdictionId = route.params?.jurisdictionId || scope.jurisdictionId || rootQuery.data?.jurisdictionId;

  const query = useAdminDashboard(jurisdictionId);

  if (needsRoot && rootQuery.isLoading) return <LoadingState />;
  if (needsRoot && rootQuery.isError) return <ErrorState message={rootQuery.error?.message} onRetry={rootQuery.refetch} />;

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
                  <Text style={styles.tileLabel}>{tile.label}</Text>
                </Card>
              ))}
            </View>

            {data.tier === 'district' && (
              <>
                <Text style={styles.sectionTitle}>Cases</Text>
                <FlatList
                  data={data.cases}
                  keyExtractor={(item) => item.victimId}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <Pressable onPress={() => navigation.navigate('CaseDetail', { victimId: item.victimId, readOnly: true })}>
                      <Card elevated style={styles.caseRow}>
                        <Text style={styles.victimId}>Case {item.victimId.slice(0, 8)}</Text>
                        <RiskBadge riskLevel={item.riskLevel} />
                      </Card>
                    </Pressable>
                  )}
                />
              </>
            )}

            {(data.tier === 'state' || data.tier === 'national') && (
              <>
                <Text style={styles.sectionTitle}>{data.tier === 'state' ? 'Districts' : 'States'}</Text>
                <FlatList
                  data={data.trends}
                  keyExtractor={(item) => item.jurisdictionId}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <Pressable onPress={() => navigation.navigate('AdminDashboard', { jurisdictionId: item.jurisdictionId })}>
                      <Card elevated>
                        <View style={styles.jurisdictionHeader}>
                          <Text style={styles.jurisdictionName}>{item.name}</Text>
                          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
                        </View>
                        <View style={styles.statRow}>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>{item.total}</Text>
                            <Text style={styles.statLabel}>cases</Text>
                          </View>
                          <View style={styles.statItem}>
                            <Text style={[styles.statValue, styles.criticalCount]}>{item.critical}</Text>
                            <Text style={styles.statLabel}>critical</Text>
                          </View>
                        </View>
                      </Card>
                    </Pressable>
                  )}
                />
              </>
            )}
          </>
        )}
      </QueryBoundary>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  tile: { width: 160, alignItems: 'center' },
  iconTile: {
    width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  count: { ...typography.h1 },
  tileLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  sectionTitle: { ...typography.h3, color: colors.primaryDark, marginBottom: spacing.sm },
  caseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  victimId: { ...typography.bodyStrong, color: colors.textPrimary },
  jurisdictionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  jurisdictionName: { ...typography.h3, color: colors.textPrimary },
  statRow: { flexDirection: 'row', gap: spacing.xl },
  statItem: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  statValue: { ...typography.bodyStrong, color: colors.textPrimary },
  statLabel: { ...typography.bodySmall, color: colors.textSecondary },
  criticalCount: { color: colors.danger },
});
