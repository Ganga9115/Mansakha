import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadow';
import { typography } from '../theme/typography';

// Border-only by default (institutional flat surfaces, no shadow depth).
// `elevated` now resolves to a near-zero shadow (see theme/shadow.js) -
// kept as a prop name so call sites don't need touching, the visual
// difference from `elevated=false` is now minimal by design.
// `headerTitle`: renders a gray uppercase utility header bar above the
// content, for two-panel form/table layouts (Staff Management, System
// Config).
export default function Card({ children, style, elevated = false, padding = spacing.lg, headerTitle }) {
  return (
    <View style={[styles.base, elevated ? styles.elevated : styles.bordered, style]}>
      {headerTitle && (
        <View style={styles.header}>
          <Text style={styles.headerText}>{headerTitle}</Text>
        </View>
      )}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden' },
  bordered: { borderWidth: 1, borderColor: colors.border },
  elevated: { borderWidth: 1, borderColor: colors.border, ...shadow.card },
  header: {
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  headerText: { ...typography.label, color: colors.textSecondary },
});
