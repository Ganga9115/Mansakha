import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

// A real role-select dropdown, not a segmented toggle - built on React Native's
// core Modal (no new dependency, per not changing the tech stack). options:
// [{ value, label, icon? }]. `error`: string shown as helper text + red border.
export default function Dropdown({ options, value, onChange, placeholder = 'Select...', error, disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={[styles.trigger, error && styles.triggerError, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setOpen(true)}
      >
        {selected?.icon && <Feather name={selected.icon} size={16} color={colors.textSecondary} style={styles.triggerIcon} />}
        <Text style={styles.triggerText}>{selected ? selected.label : placeholder}</Text>
        <Feather name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            {options.map((opt, i) => (
              <Pressable
                key={opt.value}
                style={[styles.option, i < options.length - 1 && styles.optionDivider, opt.value === value && styles.optionActive]}
                onPress={() => { onChange(opt.value); setOpen(false); }}
              >
                {opt.icon && <Feather name={opt.icon} size={16} color={opt.value === value ? colors.primary : colors.textSecondary} style={styles.triggerIcon} />}
                <Text style={[styles.optionText, opt.value === value && styles.optionTextActive]}>{opt.label}</Text>
                {opt.value === value && <Feather name="check" size={16} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  trigger: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, backgroundColor: colors.white, paddingHorizontal: 12, paddingVertical: 12,
  },
  triggerError: { borderColor: colors.danger },
  triggerDisabled: { opacity: 0.5 },
  triggerIcon: { marginRight: 8 },
  triggerText: { flex: 1, color: colors.textPrimary, fontSize: 15 },
  errorText: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, marginLeft: spacing.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', padding: 24 },
  menu: {
    backgroundColor: colors.white, borderRadius: 8, borderWidth: 1, borderColor: colors.border, maxWidth: 420,
    width: '100%', alignSelf: 'center', overflow: 'hidden',
  },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  optionDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  optionActive: { backgroundColor: colors.primaryLight },
  optionText: { flex: 1, color: colors.textPrimary, fontSize: 15 },
  optionTextActive: { color: colors.primary, fontWeight: '600' },
});
