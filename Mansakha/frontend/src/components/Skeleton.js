import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

// Static gray placeholder block - deterministic, no shimmer/pulse loop,
// per the "avoid non-functional/stylized animation" institutional-portal
// requirement.
export function Skeleton({ width = '100%', height = 16, style }) {
  return <View style={[{ width, height }, styles.block, style]} />;
}

export function SkeletonRows({ rows = 4, rowHeight = 56 }) {
  return (
    <View style={styles.rowsWrap}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={rowHeight} style={styles.row} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.border, borderRadius: radius.sm },
  rowsWrap: { padding: spacing.lg },
  row: { borderRadius: radius.md, marginBottom: spacing.md },
});
