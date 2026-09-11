import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { radius } from '../theme/radius';

// Deterministic, professional loading indicator - a thin filled bar, not a
// spinner, for data-loading contexts where a spinner feels too casual.
// `progress`: 0-1. Omit for an indeterminate (full-width, low-opacity) bar.
export default function ProgressBar({ progress }) {
  const determinate = typeof progress === 'number';
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          determinate ? { width: `${Math.max(0, Math.min(1, progress)) * 100}%` } : styles.indeterminate,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  indeterminate: { width: '100%', opacity: 0.5 },
});
