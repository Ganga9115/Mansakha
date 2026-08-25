import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import InlineTooltip from './InlineTooltip';

// Flat, border-lined metric tile - the numeric value is the visual anchor,
// not a colored icon circle. `icon` renders small and inline next to the
// label (a marker, not a decorative tile); `disclaimer` uses InlineTooltip
// to explain what the metric means, per the institutional-portal
// requirement for inline disclaimers next to complex/ambiguous terms.
export default function StatCard({ label, value, icon, disclaimer }) {
  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        {icon && <Feather name={icon} size={13} color={colors.textSecondary} style={styles.icon} />}
        <Text style={styles.label}>{label}</Text>
        {disclaimer && <InlineTooltip text={disclaimer} />}
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.lg, height: 100, justifyContent: 'space-between',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: spacing.xs },
  label: { ...typography.label, color: colors.textSecondary },
  value: { ...typography.display, fontSize: 28, color: colors.textPrimary },
});
