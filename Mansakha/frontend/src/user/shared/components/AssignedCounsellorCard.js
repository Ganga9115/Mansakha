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

// Feature Catalog Section 1.4 "Call Counsellor button" / in-app chat - the
// "opted in AND assigned" card, shared between SettingsScreen.js (where this
// button logic first lived) and SupportScreen.js, so the tel: link-building
// isn't duplicated. `counsellor` is useAssignedCounsellor()'s
// `data.counsellor` - { fullName, phone }. The WhatsApp redirect this used
// to offer alongside Call/Chat has been removed - all communication with
// the assigned counsellor now goes through the in-app chat
// (user/chat/screens/CounsellorChatScreen.js), not an external app.
export default function AssignedCounsellorCard({ counsellor, navigation }) {
  const toast = useToast();

  const handleCall = () => {
    if (!counsellor?.phone) return;
    Linking.openURL(`tel:${counsellor.phone}`).catch(() => toast.error('Could not start a call on this device.'));
  };

  const handleChat = () => {
    navigation?.navigate('CounsellorChat');
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
        <Pressable style={[styles.outlineBtn, { flex: 1 }]} onPress={handleCall}>
          <Feather name="phone" size={16} color={colors.textPrimary} style={{ marginRight: spacing.xs }} />
          <Text style={styles.outlineBtnText}>Call</Text>
        </Pressable>
        {!!navigation && (
          <Pressable style={[styles.outlineBtn, { flex: 1 }]} onPress={handleChat}>
            <Feather name="message-square" size={16} color={colors.textPrimary} style={{ marginRight: spacing.xs }} />
            <Text style={styles.outlineBtnText}>Chat</Text>
          </Pressable>
        )}
      </View>
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
