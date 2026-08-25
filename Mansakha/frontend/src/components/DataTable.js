import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { EmptyState } from './QueryStates';

// Striped, border-lined tabular list - replaces the earlier pattern of
// rendering lists as a stack of individually-bordered Cards (Case Queue,
// Audit Log, Staff Management, Alerts Feed). Not virtualized (FlatList) -
// these lists are page-sized (20-50 rows) already via backend pagination,
// so a plain View list keeps row striping/accessibility simple.
// columns: [{ key, label, flex?, render?(item) }]
export default function DataTable({ columns, data, keyExtractor, onRowPress, emptyMessage = 'Nothing here yet.', emptyIcon }) {
  if (!data || data.length === 0) {
    return <EmptyState message={emptyMessage} icon={emptyIcon} />;
  }

  return (
    <View style={styles.table} accessibilityRole="table">
      <View style={[styles.row, styles.headerRow]} accessibilityRole="row">
        {columns.map((col) => (
          <Text
            key={col.key}
            style={[styles.headerCell, { flex: col.flex || 1 }]}
            accessibilityRole="columnheader"
          >
            {col.label}
          </Text>
        ))}
      </View>

      {data.map((item, index) => {
        const key = keyExtractor(item);
        const RowWrapper = onRowPress ? Pressable : View;
        return (
          <RowWrapper
            key={key}
            style={[styles.row, index % 2 === 1 && styles.rowStriped]}
            onPress={onRowPress ? () => onRowPress(item) : undefined}
            accessibilityRole="row"
          >
            {columns.map((col) => (
              <View key={col.key} style={{ flex: col.flex || 1 }} accessibilityRole="cell">
                {col.render ? col.render(item) : <Text style={styles.cellText}>{item[col.key]}</Text>}
              </View>
            ))}
          </RowWrapper>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white,
  },
  headerRow: { backgroundColor: colors.surface, paddingVertical: spacing.sm },
  headerCell: { ...typography.label, color: colors.textSecondary },
  rowStriped: { backgroundColor: colors.surface },
  cellText: { ...typography.body, color: colors.textPrimary },
});
