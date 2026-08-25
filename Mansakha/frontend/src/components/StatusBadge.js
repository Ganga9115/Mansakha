import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

// Flat, bordered, tinted-background pill - covers both risk levels
// (Low/Moderate/High/Critical) and operational statuses (Open/
// Acknowledged/Resolved/Active/Pending/Light/Moderate/Heavy load), with a
// text label + icon so status is never conveyed by color alone.
const STATUS_META = {
  Low: { color: colors.low, icon: 'check-circle' },
  Moderate: { color: colors.moderate, icon: 'alert-circle' },
  High: { color: colors.high, icon: 'alert-triangle' },
  Critical: { color: colors.danger, icon: 'alert-octagon' },
  Open: { color: colors.danger, icon: 'alert-octagon' },
  Acknowledged: { color: colors.moderate, icon: 'clock' },
  Resolved: { color: colors.low, icon: 'check-circle' },
  Active: { color: colors.low, icon: 'check-circle' },
  Pending: { color: colors.moderate, icon: 'clock' },
  Deactivated: { color: colors.danger, icon: 'user-x' },
  Light: { color: colors.low, icon: 'check-circle' },
  Heavy: { color: colors.danger, icon: 'alert-triangle' },
  // Audit-log action types (writeAuditLog()'s actual action strings).
  create: { color: colors.success, icon: 'plus-circle' },
  revoke: { color: colors.danger, icon: 'user-x' },
  update: { color: colors.warning, icon: 'edit-2' },
  read: { color: colors.textSecondary, icon: 'eye' },
  export: { color: colors.primary, icon: 'download' },
  delete: { color: colors.danger, icon: 'trash-2' },
};

export default function StatusBadge({ status, icon }) {
  if (!status) return null;
  const meta = STATUS_META[status] || { color: colors.textSecondary, icon: 'circle' };
  const resolvedIcon = icon || meta.icon;

  return (
    <View style={[styles.badge, { backgroundColor: `${meta.color}14`, borderColor: `${meta.color}40` }]}>
      <Feather name={resolvedIcon} size={12} color={meta.color} style={styles.icon} />
      <Text style={[styles.text, { color: meta.color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, borderWidth: 1,
  },
  icon: { marginRight: 4 },
  text: { ...typography.label, textTransform: 'capitalize' },
});
