import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useToast } from '../context/ToastContext';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { typography } from '../theme/typography';
import { shadow } from '../theme/shadow';
import Card from './Card';

// Feature Catalog Section 1.4 "Call Counsellor button" / in-app chat / WhatsApp
// redirect - the "opted in AND assigned" card, shared between SettingsScreen.js
// (where this button logic first lived) and SupportScreen.js, so the tel:/wa.me
// link-building isn't duplicated. `counsellor` is
// useAssignedCounsellor()'s `data.counsellor` - { fullName, phone, whatsappNumber }.
export default function AssignedCounsellorCard({ counsellor, navigation }) {
  const toast = useToast();

  const handleCall = () => {
    if (!counsellor?.phone) return;
    Linking.openURL(`tel:${counsellor.phone}`).catch(() => toast.error('Could not start a call on this device.'));
  };

  const handleWhatsApp = () => {
    if (!counsellor?.whatsappNumber) return;
    // wa.me expects digits only (no +, spaces, or dashes).
    const digits = counsellor.whatsappNumber.replace(/[^\d]/g, '');
    Linking.openURL(`https://wa.me/${digits}`).catch(() => toast.error('Could not open WhatsApp on this device.'));
  };

  return (
    <Card style={styles.customCard}>
      <View style={styles.cardHeader}>
        <View style={styles.accountIconTile}>
          <Feather name="user" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardHeaderTitle}>{counsellor?.fullName}</Text>
          <Text style={styles.cardHeaderSubtitle}>Assigned Counsellor</Text>
        </View>
      </View>
      <View style={styles.buttonRow}>
        <Pressable style={[styles.outlineBtn, styles.halfBtn]} onPress={() => navigation.navigate('CounsellorChat')}>
          <Feather name="message-circle" size={16} color={colors.textPrimary} style={{ marginRight: spacing.xs }} />
          <Text style={styles.outlineBtnText}>Message</Text>
        </Pressable>
        <Pressable style={[styles.outlineBtn, styles.halfBtn]} onPress={handleCall}>
          <Feather name="phone" size={16} color={colors.textPrimary} style={{ marginRight: spacing.xs }} />
          <Text style={styles.outlineBtnText}>Call</Text>
        </Pressable>
      </View>
      {!!counsellor?.whatsappNumber && (
        <View style={[styles.buttonRow, { marginTop: spacing.sm }]}>
          <Pressable style={[styles.outlineBtn, { flex: 1 }]} onPress={handleWhatsApp}>
            <Feather name="message-square" size={16} color={colors.textPrimary} style={{ marginRight: spacing.xs }} />
            <Text style={styles.outlineBtnText}>WhatsApp</Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  customCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  accountIconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  cardHeaderTitle: { ...typography.h3, color: colors.textPrimary },
  cardHeaderSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  halfBtn: { flex: 1 },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  outlineBtnText: { ...typography.bodyStrong, color: colors.textPrimary },
});
