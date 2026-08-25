import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

const VARIANT = {
  success: { icon: 'check-circle', bg: colors.successLight, fg: colors.success },
  error: { icon: 'alert-circle', bg: colors.dangerLight, fg: colors.danger },
  info: { icon: 'info', bg: colors.infoLight, fg: colors.primaryDark },
};

function ToastRow({ toast, onDismiss }) {
  const { icon, bg, fg } = VARIANT[toast.type] || VARIANT.info;

  return (
    <View style={[styles.row, { backgroundColor: bg, borderColor: `${fg}40` }]} accessibilityRole="alert">
      <Feather name={icon} size={18} color={fg} style={styles.icon} />
      <Text style={[styles.message, { color: fg }]} numberOfLines={3}>{toast.message}</Text>
      <Pressable onPress={() => onDismiss(toast.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss notification">
        <Feather name="x" size={16} color={fg} />
      </Pressable>
    </View>
  );
}

// Instant appearance (no slide-in animation), border-lined banner strip at
// the top of the content area - not a floating rounded shadow card.
export default function Toast({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((t) => <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'stretch', zIndex: 999 },
  row: {
    flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  icon: { marginRight: spacing.sm },
  message: { flex: 1, ...typography.bodySmall, marginRight: spacing.sm },
});
