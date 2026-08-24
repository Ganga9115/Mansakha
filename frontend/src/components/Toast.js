import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { shadow } from '../theme/shadow';

const VARIANT = {
  success: { icon: 'check-circle', bg: colors.successLight, fg: colors.success },
  error: { icon: 'alert-circle', bg: colors.dangerLight, fg: colors.danger },
  info: { icon: 'info', bg: colors.infoLight, fg: colors.primaryDark },
};

function ToastRow({ toast, onDismiss }) {
  const translateY = useRef(new Animated.Value(-16)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  const { icon, bg, fg } = VARIANT[toast.type] || VARIANT.info;

  return (
    <Animated.View style={[styles.row, { backgroundColor: bg, transform: [{ translateY }], opacity }]}>
      <Feather name={icon} size={18} color={fg} style={styles.icon} />
      <Text style={[styles.message, { color: fg }]} numberOfLines={3}>{toast.message}</Text>
      <Pressable onPress={() => onDismiss(toast.id)} hitSlop={8}>
        <Feather name="x" size={16} color={fg} />
      </Pressable>
    </Animated.View>
  );
}

// Fixed to the top of the screen, stacking newest-last - a plain RN Animated
// view, no new dependency.
export default function Toast({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((t) => <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center', zIndex: 999 },
  row: {
    flexDirection: 'row', alignItems: 'center', maxWidth: 420, width: '92%',
    borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm, ...shadow.pop,
  },
  icon: { marginRight: spacing.sm },
  message: { flex: 1, ...typography.bodySmall, marginRight: spacing.sm },
});
