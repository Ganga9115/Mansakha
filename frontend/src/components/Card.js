import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadow';

// elevated: shadow instead of a flat 1px border (used for cards that need to
// stand out - stat tiles, the auth card); padding: override the default.
export default function Card({ children, style, elevated = false, padding = spacing.lg }) {
  return (
    <View style={[styles.base, elevated ? styles.elevated : styles.bordered, { padding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md },
  bordered: { borderWidth: 1, borderColor: colors.border },
  elevated: { ...shadow.card },
});
