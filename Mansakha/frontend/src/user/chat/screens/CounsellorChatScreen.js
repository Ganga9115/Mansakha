import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import TopRightActions from '../../shared/components/TopRightActions';
import { useAssignedCounsellor, useUserDashboard } from '../../shared/services/hooks';
import AssignedCounsellorCard from '../../shared/components/AssignedCounsellorCard';
import { LoadingState } from '../../shared/components/QueryStates';

export default function CounsellorChatScreen({ navigation }) {
  const { tier } = useResponsive();
  const counsellorQuery = useAssignedCounsellor();
  const dashboardQuery = useUserDashboard();

  return (
    <View style={styles.container}>
      <View style={styles.topHeader}>
        {tier !== 'desktop' && (
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.primaryDark} />
          </Pressable>
        )}
        <View style={styles.headerIconTile}>
          <Feather name="user" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>My Counsellor</Text>
          <Text style={styles.subtext}>Private, opted-in support</Text>
        </View>
        <TopRightActions />
      </View>

      <View style={[styles.body, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        {counsellorQuery.isLoading || dashboardQuery.isLoading ? (
          <LoadingState />
        ) : counsellorQuery.data?.assigned ? (
          <View style={styles.content}>
             <View style={styles.heroBox}>
               <Feather name="heart" size={48} color={colors.primary} style={{ marginBottom: spacing.md }} />
               <Text style={styles.heroTitle}>You are not alone.</Text>
               <Text style={styles.heroText}>
                 Your dedicated counsellor is here to support you. You can reach out directly via WhatsApp or phone call whenever you need someone to talk to.
               </Text>
             </View>
             <AssignedCounsellorCard counsellor={counsellorQuery.data.counsellor} navigation={navigation} />
          </View>
        ) : (
          <View style={styles.content}>
             <Text style={styles.heroText}>You do not currently have a counsellor assigned.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: {
    width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  body: { flex: 1, padding: spacing.xl },
  content: { flex: 1 },
  heroBox: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTitle: { ...typography.h2, color: colors.primaryDark, marginBottom: spacing.sm },
  heroText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
});
