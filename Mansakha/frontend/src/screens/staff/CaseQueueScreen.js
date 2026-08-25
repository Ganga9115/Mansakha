import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import Button from '../../components/Button';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useCounsellorCases } from '../../services/hooks';

const RISK_FILTERS = [null, 'Critical', 'High', 'Moderate', 'Low'];
const PAGE_SIZE = 20;

export default function CaseQueueScreen({ navigation }) {
  const [riskLevel, setRiskLevel] = useState(null);
  const [page, setPage] = useState(1);
  const query = useCounsellorCases(riskLevel, page);

  const columns = [
    { key: 'victimId', label: 'Case ID', flex: 1.4, render: (item) => <Text style={styles.cellStrong}>Case {item.victimId.slice(0, 8)}</Text> },
    { key: 'caseStage', label: 'Stage', flex: 1, render: (item) => <Text style={styles.cell}>{item.caseStage}</Text> },
    { key: 'riskLevel', label: 'Risk Level', flex: 1, render: (item) => <StatusBadge status={item.riskLevel} /> },
  ];

  return (
    <ScreenContainer>
      <View style={styles.filterRow}>
        {RISK_FILTERS.map((r) => {
          const active = riskLevel === r;
          return (
            <Pressable
              key={r || 'all'}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => { setRiskLevel(r); setPage(1); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{r || 'All'}</Text>
            </Pressable>
          );
        })}
      </View>

      <QueryBoundary query={query} empty={(data) => !data?.cases?.length}>
        {(data) => {
          const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
          return (
            <>
              <DataTable
                columns={columns}
                data={data.cases}
                keyExtractor={(item) => item.victimId}
                onRowPress={(item) => navigation.navigate('CaseDetail', { victimId: item.victimId, readOnly: false })}
                emptyMessage="No cases match this filter."
                emptyIcon="inbox"
              />
              <View style={styles.pagination}>
                <Button title="Previous" variant="outline" onPress={() => setPage((p) => p - 1)} disabled={page <= 1} style={styles.pageButton} />
                <Text style={styles.pageLabel}>Page {page} of {totalPages}</Text>
                <Button title="Next" variant="outline" onPress={() => setPage((p) => p + 1)} disabled={page >= totalPages} style={styles.pageButton} />
              </View>
            </>
          );
        }}
      </QueryBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.lg },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  filterChipActive: { borderBottomColor: colors.primary },
  filterText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.primary },
  cellStrong: { ...typography.bodyStrong, color: colors.textPrimary },
  cell: { ...typography.body, color: colors.textPrimary },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
  pageButton: { minWidth: 110 },
  pageLabel: { ...typography.bodySmall, color: colors.textSecondary },
});
