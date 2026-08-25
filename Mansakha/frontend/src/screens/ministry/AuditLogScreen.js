import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import Button from '../../components/Button';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ScreenContainer from '../../components/ScreenContainer';
import { QueryBoundary } from '../../components/QueryStates';
import { useAuditLog } from '../../services/hooks';

const PAGE_SIZE = 50;

// The most "telemetry log"-like screen - a proper DataTable
// (Timestamp / Action / Entity Type / Entity ID), striped rows, action
// type as a StatusBadge.
export default function AuditLogScreen() {
  const [page, setPage] = useState(1);
  const query = useAuditLog(page);

  const columns = [
    { key: 'occurred_at', label: 'Timestamp', flex: 1.3, render: (item) => <Text style={styles.cell}>{new Date(item.occurred_at).toLocaleString()}</Text> },
    { key: 'action', label: 'Action', flex: 1, render: (item) => <StatusBadge status={item.action} /> },
    { key: 'entity_type', label: 'Entity Type', flex: 1, render: (item) => <Text style={styles.cell}>{item.entity_type}</Text> },
    { key: 'entity_id', label: 'Entity ID', flex: 1.2, render: (item) => <Text style={styles.cellMono} numberOfLines={1}>{item.entity_id || '-'}</Text> },
  ];

  return (
    <ScreenContainer>
      <QueryBoundary query={query} empty={(data) => !data?.entries?.length}>
        {(data) => (
          <>
            <DataTable columns={columns} data={data.entries} keyExtractor={(item) => item.log_id} emptyMessage="No audit entries yet." emptyIcon="file-text" />
            <View style={styles.pagination}>
              <Button title="Previous" icon="chevron-left" variant="outline" disabled={page <= 1} onPress={() => setPage((p) => p - 1)} style={styles.pageButton} />
              <Text style={styles.pageLabel}>Page {page}</Text>
              <Button title="Next" icon="chevron-right" variant="outline" disabled={data.entries.length < PAGE_SIZE} onPress={() => setPage((p) => p + 1)} style={styles.pageButton} />
            </View>
          </>
        )}
      </QueryBoundary>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  cell: { ...typography.body, color: colors.textPrimary },
  cellMono: { ...typography.bodySmall, color: colors.textSecondary },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg },
  pageButton: { minWidth: 120 },
  pageLabel: { ...typography.bodySmall, color: colors.textSecondary },
});
