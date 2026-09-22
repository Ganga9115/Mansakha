import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, ScrollView, Platform, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadow } from '../theme/shadow';
import { useResponsive } from '../hooks/useResponsive';
import { sidebarWidth } from '../theme/layout';

const OPTION_HEIGHT = 44; // fixed, so the pill's translateY math (index * OPTION_HEIGHT) never needs measuring

// A real role-select dropdown, not a segmented toggle - built on React Native's
// core Modal (no new dependency, per not changing the tech stack). options:
// [{ value, label, icon? }]. `error`: string shown as helper text + red border.
// The option list carries the same "glide" highlight as web's GlideSelect
// (see shared/components/GlideSelect.jsx in web-frontend) - a single pill,
// Animated.Value-driven instead of a CSS transition, that glides to whichever
// row is pressed-in rather than each row just flashing a background color.
// External prop interface is unchanged from before this rewrite, so every
// call site (SelfRegisterScreen.js x4, SettingsScreen.js,
// LanguageSelectScreen.js) needed zero changes.
export default function Dropdown({ options, value, onChange, placeholder = 'Select...', error, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [pillIndex, setPillIndex] = useState(null);
  const selected = options.find((o) => o.value === value);
  const { isDesktop } = useResponsive();
  const pillY = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(0)).current;

  const openMenu = () => {
    if (disabled) return;
    const selectedIndex = options.findIndex((o) => o.value === value);
    setPillIndex(selectedIndex >= 0 ? selectedIndex : null);
    pillY.setValue(Math.max(0, selectedIndex) * OPTION_HEIGHT);
    pillOpacity.setValue(selectedIndex >= 0 ? 1 : 0);
    setOpen(true);
  };

  const glideTo = (index) => {
    setPillIndex(index);
    Animated.parallel([
      Animated.timing(pillY, { toValue: index * OPTION_HEIGHT, duration: 220, useNativeDriver: false }),
      Animated.timing(pillOpacity, { toValue: 1, duration: 150, useNativeDriver: false }),
    ]).start();
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={[styles.trigger, error && styles.triggerError, disabled && styles.triggerDisabled]}
        onPress={openMenu}
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
              <View style={{ position: 'relative' }}>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.pill, { transform: [{ translateY: pillY }], opacity: pillOpacity }]}
                />
                {options.map((opt, i) => (
                  <Pressable
                    key={opt.value}
                    style={[styles.option, i < options.length - 1 && styles.optionDivider]}
                    onPressIn={() => glideTo(i)}
                    onPress={() => { onChange(opt.value); setOpen(false); }}
                  >
                    {opt.icon && <Feather name={opt.icon} size={14} color={opt.value === value ? colors.primary : colors.textSecondary} style={styles.triggerIcon} />}
                    <Text style={[styles.optionText, opt.value === value && styles.optionTextActive]}>{opt.label}</Text>
                    {opt.value === value && <Feather name="check" size={16} color={colors.primary} />}
                  </Pressable>
                ))}
              </View>
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
  pill: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: 0,
    height: OPTION_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: 'rgba(124, 92, 191, 0.14)',
  },
  option: { flexDirection: 'row', alignItems: 'center', height: OPTION_HEIGHT, paddingHorizontal: 16 },
  optionDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  optionText: { flex: 1, color: colors.textPrimary, fontSize: 15 },
  optionTextActive: { color: colors.primary, fontWeight: '700' },
});
