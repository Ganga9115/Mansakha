import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';
import { spacing } from '../theme/spacing';

// Shimmer loading placeholder via RN Animated (opacity pulse, not a real
// gradient sweep - no new dependency needed for that). Used by
// QueryStates.js's LoadingState in place of a bare spinner.
export function Skeleton({ width = '100%', height = 16, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[{ width, height, opacity }, styles.block, style]} />;
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
