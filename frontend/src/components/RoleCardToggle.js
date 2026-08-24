import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';

// FarmConnect's Farmer/Buyer bordered-card toggle pattern: icon + label,
// grid of equal-width cards, border-2 selected state. options:
// [{ value, label, icon }] - designed for 2 options but works for more.
export default function RoleCardToggle({ options, value, onChange }) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.card, active && styles.cardActive]}
          >
            <Feather name={opt.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  card: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg,
    paddingVertical: spacing.md, backgroundColor: colors.white,
  },
  cardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  label: { ...typography.bodyStrong, color: colors.textSecondary },
  labelActive: { color: colors.primaryDark },
});
