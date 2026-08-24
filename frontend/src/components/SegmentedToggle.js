import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

// Pill-style segmented toggle, generalized across the app's several uses:
// Victim's Email/Mobile OTP tabs, Login/Signup, Password/OTP, Staff's role
// choice. options: [{ value, label, icon?, disabled? }]
export default function SegmentedToggle({ options, value, onChange }) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.segment, active && styles.segmentActive, opt.disabled && styles.segmentDisabled]}
            onPress={() => !opt.disabled && onChange(opt.value)}
          >
            {opt.icon && <Feather name={opt.icon} size={15} color={active ? colors.onPrimary : colors.textSecondary} style={styles.icon} />}
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, padding: 4, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: spacing.lg },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.primary },
  segmentDisabled: { opacity: 0.5 },
  icon: { marginRight: 6 },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  labelActive: { color: colors.onPrimary },
});
