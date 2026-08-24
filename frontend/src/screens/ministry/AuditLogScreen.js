import React, { useState } from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { QueryBoundary } from '../../components/QueryStates';
import { useAuditLog } from '../../services/hooks';

const PAGE_SIZE = 50;

// Maps the action strings actually written by writeAuditLog() across the
// backend (ministry.js/counsellor.js/victim.js/admin.js) to a glyph + tint -
// falls back to a neutral "activity" glyph for anything unmapped rather than
// guessing at action strings that don't exist yet.
const ACTION_META = {
  create: { icon: 'plus-circle', color: colors.success, tint: colors.successLight },
  revoke: { icon: 'user-x', color: colors.danger, tint: colors.dangerLight },
  update: { icon: 'edit-2', color: colors.warning, tint: colors.warningLight },
  read: { icon: 'eye', color: colors.textSecondary, tint: colors.surface },
  export: { icon: 'download', color: colors.primary, tint: colors.infoLight },
};
const DEFAULT_ACTION_META = { icon: 'activity', color: colors.textSecondary, tint: colors.surface };

function metaForAction(action) {
  return ACTION_META[action] || DEFAULT_ACTION_META;
}

export default function AuditLogScreen() {
  const [page, setPage] = useState(1);
  const query = useAuditLog(page);

  return (
    <View style={styles.container}>
      <QueryBoundary query={query} empty={(data) => !data?.entries?.length}>
        {(data) => (
          <FlatList
            data={data.entries}
            keyExtractor={(item) => item.log_id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const meta = metaForAction(item.action);
              return (
                <Card style={styles.row}>
                  <View style={styles.rowContent}>
                    <View style={[styles.iconTile, { backgroundColor: meta.tint }]}>
                      <Feather name={meta.icon} size={16} color={meta.color} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.action}>{item.action} - {item.entity_type}</Text>
                      <Text style={styles.meta}>{new Date(item.occurred_at).toLocaleString()}</Text>
                    </View>
                  </View>
                </Card>
              );
            }}
            ListFooterComponent={
              <View style={styles.pagination}>
                <Button
                  title="Previous"
                  icon="chevron-left"
                  variant="outline"
                  disabled={page <= 1}
                  onPress={() => setPage((p) => p - 1)}
                  style={styles.pageButton}
                />
                <Text style={styles.pageLabel}>Page {page}</Text>
                <Button
                  title="Next"
                  icon="chevron-right"
                  variant="outline"
                  disabled={data.entries.length < PAGE_SIZE}
                  onPress={() => setPage((p) => p + 1)}
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
  list: { padding: spacing.lg },
  row: { marginBottom: spacing.sm },
  rowContent: { flexDirection: 'row', alignItems: 'center' },
  iconTile: {
    width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowText: { flex: 1 },
  action: { ...typography.bodyStrong, color: colors.textPrimary, textTransform: 'capitalize' },
  meta: { ...typography.bodySmall, color: colors.textSecondary },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg },
  pageButton: { minWidth: 120 },
  pageLabel: { ...typography.bodySmall, color: colors.textSecondary },
});
