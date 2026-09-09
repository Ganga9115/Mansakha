import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useUserDashboard, useCompensationStatus } from '../../shared/services/hooks';

// Compensation Module - read-only for the victim. Auto-identifies the
// applicable statutory category and suggested amount the moment a case is
// registered, then shows the live 3-stage payment tracker once the
// District Welfare Officer has verified an exact figure. Entirely separate
// from Financial Aid (FinancialAidScreen.js) - this is the larger
// statutory award, paid out as the case itself progresses.

function inr(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function StageRow({ stage }) {
  const isPaid = stage.status === 'Paid';
  return (
    <View style={[styles.stageRow, isPaid && styles.stageRowPaid, !stage.unlocked && styles.stageRowLocked]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.stageName}>{stage.stage}</Text>
        <Text style={styles.stageMeta}>
          {inr(stage.amount)} ({stage.percentage}%){isPaid && stage.paidAt ? ` • paid ${new Date(stage.paidAt).toLocaleDateString('en-IN')}` : ''}
        </Text>
      </View>
      {isPaid ? (
        <View style={styles.stageBadgePaid}>
          <Feather name="check-circle" size={13} color={colors.success} />
          <Text style={styles.stageBadgePaidText}>Paid</Text>
        </View>
      ) : stage.unlocked ? (
        <View style={styles.stageBadgePending}>
          <Text style={styles.stageBadgePendingText}>Pending</Text>
        </View>
      ) : (
        <View style={styles.stageBadgeLocked}>
          <Feather name="lock" size={11} color={colors.textSecondary} />
          <Text style={styles.stageBadgeLockedText}>Locked</Text>
        </View>
      )}
    </View>
  );
}

function CompensationContent({ data }) {
  return (
    <>
      <Card>
        <View style={styles.headerRow}>
          <Feather name="credit-card" size={18} color={colors.primaryDark} />
          <Text style={styles.cardTitle}>Statutory Compensation</Text>
        </View>
        <Text style={styles.categoryText}>{data.statutoryCategory}</Text>
        <Text style={styles.amountText}>{inr(data.verified ? data.verifiedAmount : data.suggestedAmount)}</Text>
        <Text style={styles.introText}>
          {data.verified
            ? 'This amount has been verified by the District Welfare Officer and is being tracked below.'
            : 'This is an automatically suggested amount based on your case type. It will be verified by the District Welfare Officer.'}
        </Text>
      </Card>

      {data.verified && data.stages && (
        <Card>
          <Text style={styles.cardTitle}>Payment Stages</Text>
          <Text style={styles.introText}>Compensation is released in stages as your case progresses through the legal process.</Text>
          <View style={{ gap: spacing.sm }}>
            {data.stages.map((s) => (
              <StageRow key={s.stage} stage={s} />
            ))}
          </View>
        </Card>
      )}
    </>
  );
}

export default function CompensationScreen({ navigation, route }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  // migration_034 - which docket in the caller's own family this screen
  // concerns (passed from HomeScreen's own active case / case switcher);
  // defaults to the caller's own anchor case when opened without one.
  const caseUserId = route?.params?.caseUserId;
  const dashboardQuery = useUserDashboard(caseUserId);
  const compensationQuery = useCompensationStatus(caseUserId);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
        ]}
      >
        <View style={styles.headerLeft}>
          {!isDesktop && (
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
              <Feather name="arrow-left" size={20} color={colors.primaryDark} />
            </Pressable>
          )}
          <View style={styles.headerIconTile}>
            <Feather name="credit-card" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Compensation</Text>
        </View>
        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions fullName={dashboardQuery.data?.fullName} alertCount={dashboardQuery.data?.alerts?.length || 0} onBellPress={() => {}} />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          <QueryBoundary query={compensationQuery}>{(data) => <CompensationContent data={data} />}</QueryBoundary>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerRight: { marginLeft: spacing.md },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: { alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  headerTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 20, fontWeight: '700' },
  body: { width: '100%', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, maxWidth: 720, alignSelf: 'center' },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15 },
  categoryText: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  amountText: { ...typography.h1, color: colors.primaryDark, fontSize: 26, fontWeight: '800', marginTop: spacing.xs },
  introText: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.sm, lineHeight: 20 },

  stageRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
  },
  stageRowPaid: { backgroundColor: colors.successLight, borderColor: colors.success },
  stageRowLocked: { opacity: 0.6 },
  stageName: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '700' },
  stageMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  stageBadgePaid: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stageBadgePaidText: { ...typography.caption, color: colors.success, fontWeight: '700' },
  stageBadgePending: { backgroundColor: colors.warningLight || '#FEF3C7', borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: spacing.sm },
  stageBadgePendingText: { ...typography.caption, color: colors.warning || '#B45309', fontWeight: '700' },
  stageBadgeLocked: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stageBadgeLockedText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
});
