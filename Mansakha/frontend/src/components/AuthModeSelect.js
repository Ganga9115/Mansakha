import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

// Flat institutional replacement for the earlier 3-level nesting
// (Login/Signup -> Password/OTP -> Email/Mobile): one row of icon-labeled
// options with a static bottom-border/text-color active state - no
// spring-driven sliding indicator, matching the rest of the app's flat,
// non-animated interaction style. options: [{ value, label, icon }]
export default function AuthModeSelect({ options, value, onChange }) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.option, active && styles.optionActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Feather name={opt.icon} size={15} color={active ? colors.primary : colors.textSecondary} />
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.lg },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1,
  },
  optionActive: { borderBottomColor: colors.primary },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  labelActive: { color: colors.primary },
});
