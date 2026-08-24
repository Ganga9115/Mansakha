import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import { QueryBoundary } from '../../components/QueryStates';
import { useWorkload } from '../../services/hooks';
import { useStaffScope } from '../../context/StaffScopeContext';

// Simple visual load cue from open-alert count - fixed thresholds, not an
// invented scoring formula: 5+ open alerts reads as a heavy load, 2+ as
// moderate, otherwise light.
function loadColor(openAlertCount) {
  if (openAlertCount >= 5) return colors.danger;
  if (openAlertCount >= 2) return colors.moderate;
  return colors.low;
}

// District tier only (Section 4.5) - the backend route itself also enforces this
// (400 if the target jurisdiction isn't a district), this screen just doesn't
// bother rendering the nav entry for State/National (see StaffShell.js).
export default function WorkloadScreen() {
  const scope = useStaffScope();
  const query = useWorkload(scope.jurisdictionId);

  return (
    <View style={styles.container}>
      <QueryBoundary query={query} empty={(data) => !data?.counsellors?.length}>
        {(data) => (
          <FlatList
            data={data.counsellors}
            keyExtractor={(item) => item.officialId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Card elevated>
                <View style={styles.nameRow}>
                  <View style={[styles.dot, { backgroundColor: loadColor(item.openAlertCount) }]} />
                  <Text style={styles.name}>{item.name}</Text>
                </View>
                <View style={styles.stats}>
                  <View style={styles.statItem}>
                    <Feather name="clipboard" size={14} color={colors.textSecondary} />
                    <Text style={styles.stat}>{item.interventionCount} interventions</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Feather name="bell" size={14} color={colors.textSecondary} />
                    <Text style={styles.stat}>{item.openAlertCount} open alerts</Text>
                  </View>
                </View>
              </Card>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  stats: { flexDirection: 'row', gap: spacing.lg },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stat: { ...typography.bodySmall, color: colors.textSecondary },
});
