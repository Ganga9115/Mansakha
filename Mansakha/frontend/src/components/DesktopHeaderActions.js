import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import SosButton from './SosButton';
import { useNavigation } from '@react-navigation/native';

export default function DesktopHeaderActions({ fullName, roleLabel = 'Victim', alertCount = 0, onBellPress }) {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SosButton asHeaderIcon />
        <Pressable
          style={styles.bellBtn}
          onPress={() => navigation?.navigate('Chatbot')}
          accessibilityRole="button"
          accessibilityLabel="Talk to Mansakha by voice"
        >
          <Feather name="phone-call" size={20} color={colors.primaryDark} />
        </Pressable>
        <Pressable style={styles.bellBtn} onPress={onBellPress}>
          <Feather name="bell" size={20} color={colors.primaryDark} />
          {alertCount > 0 && <View style={styles.bellDot} />}
        </Pressable>
      </View>

      <View style={styles.profileChip}>
        <View style={styles.avatarCircle}>
          <Feather name="user" size={18} color={colors.primary} />
        </View>
        <View>
          <Text style={styles.profileName} numberOfLines={1}>{fullName || 'Loading...'}</Text>
          <Text style={styles.profileRole} numberOfLines={1}>{roleLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 34,
    width: 256,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, fontSize: 13, color: colors.textPrimary, outlineStyle: 'none' },
  bellBtn: { padding: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  bellDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingLeft: spacing.lg,
    maxWidth: 160,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  profileName: { ...typography.bodyStrong, fontSize: 13, color: colors.textPrimary },
  profileRole: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
});
