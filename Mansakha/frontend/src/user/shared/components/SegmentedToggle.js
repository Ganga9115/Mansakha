import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';

// Flat institutional toggle - a bottom-border + text-color active state
// instead of a filled pill, generalized across the app's several uses:
// User's Login/Signup switch, Staff's role choice. options:
// [{ value, label, icon?, disabled? }]
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
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            {opt.icon && <Feather name={opt.icon} size={15} color={active ? colors.primary : colors.textSecondary} style={styles.icon} />}
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.lg },
  segment: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1,
  },
  segmentActive: { borderBottomColor: colors.primary },
  segmentDisabled: { opacity: 0.5 },
  icon: { marginRight: 6 },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
  labelActive: { color: colors.primary },
});
