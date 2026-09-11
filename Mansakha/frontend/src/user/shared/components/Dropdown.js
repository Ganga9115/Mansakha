import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadow';
import { useResponsive } from '../hooks/useResponsive';
import { sidebarWidth } from '../theme/layout';

// A real role-select dropdown, not a segmented toggle - built on React Native's
// core Modal (no new dependency, per not changing the tech stack). options:
// [{ value, label, icon? }]. `error`: string shown as helper text + red border.
export default function Dropdown({ options, value, onChange, placeholder = 'Select...', error, disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const { isDesktop } = useResponsive();

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
        <Pressable 
          style={[
            styles.backdrop, 
            { paddingLeft: isDesktop ? sidebarWidth + 24 : 24 }
          ]} 
          onPress={() => setOpen(false)}
        >
          <View style={styles.menu}>
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {options.map((opt, i) => (
                <Pressable
                  key={opt.value}
                  style={[styles.option, i < options.length - 1 && styles.optionDivider, opt.value === value && styles.optionActive]}
                  onPress={() => { onChange(opt.value); setOpen(false); }}
                >
                  {opt.icon && <Feather name={opt.icon} size={14} color={opt.value === value ? colors.primary : colors.textSecondary} style={styles.triggerIcon} />}
                  <Text style={[styles.optionText, opt.value === value && styles.optionTextActive]}>{opt.label}</Text>
                  {opt.value === value && <Feather name="check" size={16} color={colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>
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
  backdrop: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.4)', 
    justifyContent: 'center', 
    padding: 24,
    ...Platform.select({
      web: { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' },
      default: {},
    }),
  },
  menu: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)', 
    borderRadius: radius.lg, 
    borderWidth: 1.5, 
    borderColor: 'rgba(255, 255, 255, 1)', 
    maxWidth: 420,
    width: '100%', 
    alignSelf: 'center', 
    overflow: 'hidden',
    ...Platform.select({
      web: { backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)' },
      default: {},
    }),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 10,
  },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  optionDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  optionActive: { backgroundColor: 'rgba(81, 155, 206, 0.1)' },
  optionText: { flex: 1, color: colors.textPrimary, fontSize: 15 },
  optionTextActive: { color: colors.primary, fontWeight: '700' },
});
