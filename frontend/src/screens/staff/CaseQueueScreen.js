import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Button from '../../components/Button';
import RiskBadge from '../../components/RiskBadge';
import { QueryBoundary } from '../../components/QueryStates';
import { useCounsellorCases } from '../../services/hooks';

const RISK_FILTERS = [null, 'Critical', 'High', 'Moderate', 'Low'];

export default function CaseQueueScreen({ navigation }) {
  const [riskLevel, setRiskLevel] = useState(null);
  const [page, setPage] = useState(1);
  const query = useCounsellorCases(riskLevel, page);

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {RISK_FILTERS.map((r) => (
          <Pressable
            key={r || 'all'}
            style={[styles.filterChip, riskLevel === r && styles.filterChipActive]}
            onPress={() => { setRiskLevel(r); setPage(1); }}
          >
            <Text style={[styles.filterText, riskLevel === r && styles.filterTextActive]}>{r || 'All'}</Text>
          </Pressable>
        ))}
      </View>

      <QueryBoundary query={query} empty={(data) => !data?.cases?.length}>
        {(data) => (
          <FlatList
            data={data.cases}
            keyExtractor={(item) => item.victimId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable onPress={() => navigation.navigate('CaseDetail', { victimId: item.victimId, readOnly: false })}>
                <Card elevated style={styles.row}>
                  <View>
                    <Text style={styles.victimId}>Case {item.victimId.slice(0, 8)}</Text>
                    <Text style={styles.stage}>{item.caseStage}</Text>
                  </View>
                  <RiskBadge riskLevel={item.riskLevel} />
                </Card>
              </Pressable>
            )}
            ListFooterComponent={
              <View style={styles.pagination}>
                <Button
                  title="Previous"
                  variant="outline"
                  onPress={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                  style={styles.pageButton}
                />
                <Text style={styles.pageLabel}>Page {page}</Text>
                <Button
                  title="Next"
                  variant="outline"
                  onPress={() => setPage((p) => p + 1)}
                  disabled={data.cases.length < 20}
                  style={styles.pageButton}
                />
              </View>
            }
          />
        )}
      </QueryBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { ...typography.bodySmall, color: colors.textSecondary },
  filterTextActive: { color: colors.onPrimary, fontWeight: '600' },
  list: { padding: spacing.lg, paddingTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  victimId: { ...typography.bodyStrong, color: colors.textPrimary },
  stage: { ...typography.bodySmall, color: colors.textSecondary },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
  pageButton: { minWidth: 110 },
  pageLabel: { ...typography.bodySmall, color: colors.textSecondary },
});
