import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import Button from '../../shared/components/Button';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary } from '../../shared/components/QueryStates';
import { useUserDashboard, useFinancialAidStatus, useRequestFinancialAid, useConfirmFinancialAid } from '../../shared/services/hooks';

// Financial Aid - District Welfare Officer's Immediate Relief track. Kept
// entirely separate from the Compensation Module (CompensationScreen.js) -
// this is the fast, urgent-need pipeline (money, food, shelter), not the
// larger statutory award paid out over the life of the case.

function RequestForm() {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const requestAid = useRequestFinancialAid();

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setError(null);
    try {
      await requestAid.mutateAsync(reason.trim());
    } catch (err) {
      setError(err.message || 'Could not submit your request.');
    }
  };

  return (
    <Card>
      <Text style={styles.cardTitle}>Request Financial Aid</Text>
      <Text style={styles.introText}>
        Kindly describe the urgent assistance you require - money, food, shelter, or other essential
        support. The District Welfare Officer will review and respond promptly.
      </Text>
      <TextInput
        style={styles.textArea}
        multiline
        numberOfLines={4}
        placeholder="e.g. I have lost my income and need urgent help with food and rent..."
        placeholderTextColor={colors.textSecondary}
        value={reason}
        onChangeText={setReason}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Button title="Submit Request" onPress={handleSubmit} loading={requestAid.isPending} disabled={!reason.trim() || requestAid.isPending} />
    </Card>
  );
}

function StatusCard({ data }) {
  const [error, setError] = useState(null);
  const confirmAid = useConfirmFinancialAid();
  const relief = data.immediateRelief;

  const handleConfirm = async () => {
    setError(null);
    try {
      await confirmAid.mutateAsync();
    } catch (err) {
      setError(err.message || 'Could not confirm receipt.');
    }
  };

  return (
    <Card>
      <View style={styles.statusHeaderRow}>
        <Text style={styles.cardTitle}>Your Financial Aid Request</Text>
        <View style={[styles.statusPill, data.status === 'Resolved' ? styles.statusPillResolved : styles.statusPillOpen]}>
          <Text style={[styles.statusPillText, data.status === 'Resolved' ? styles.statusPillTextResolved : styles.statusPillTextOpen]}>{data.status}</Text>
        </View>
      </View>

      {!relief && <Text style={styles.pendingText}>Your request is under review. The District Welfare Officer will respond shortly.</Text>}

      {relief && (
        <View style={{ gap: spacing.sm }}>
          <View style={styles.typeRow}>
            {relief.assistanceTypes.map((t) => (
              <View key={t} style={styles.typeChip}>
                <Text style={styles.typeChipText}>{t}</Text>
              </View>
            ))}
          </View>
          {relief.financialAmount != null && (
            <Text style={styles.detailText}>Financial assistance: <Text style={styles.detailValue}>₹{Number(relief.financialAmount).toLocaleString('en-IN')}</Text></Text>
          )}
          {relief.essentialSupportNotes && <Text style={styles.detailText}>{relief.essentialSupportNotes}</Text>}

          {relief.status === 'Approved' && (
            <View style={styles.infoBox}>
              <Feather name="clock" size={14} color={colors.warning || '#B45309'} />
              <Text style={styles.infoBoxText}>Approved - the office is arranging to provide this to you.</Text>
            </View>
          )}
          {relief.status === 'Provided' && (
            <>
              <View style={styles.infoBox}>
                <Feather name="info" size={14} color={colors.warning || '#B45309'} />
                <Text style={styles.infoBoxText}>Kindly confirm once you have received this assistance.</Text>
              </View>
              {error && <Text style={styles.errorText}>{error}</Text>}
              <Button title="Confirm Receipt" onPress={handleConfirm} loading={confirmAid.isPending} disabled={confirmAid.isPending} />
            </>
          )}
          {relief.status === 'Confirmed' && (
            <View style={styles.feedbackThanks}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={styles.feedbackThanksText}>Confirmed received on {new Date(relief.confirmedAt).toLocaleDateString('en-IN')}.</Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

export default function FinancialAidScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const statusQuery = useFinancialAidStatus();

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
            <Feather name="heart" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Financial Aid</Text>
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
          <QueryBoundary query={statusQuery}>
            {(data) => (data?.hasRequest ? <StatusCard data={data} /> : <RequestForm />)}
          </QueryBoundary>
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

  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15, marginBottom: spacing.xs },
  introText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
    minHeight: 90, textAlignVertical: 'top', color: colors.textPrimary, marginBottom: spacing.md, ...typography.bodySmall,
  },
  errorText: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.md },

  statusHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  statusPill: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  statusPillOpen: { backgroundColor: colors.warningLight || '#FEF3C7' },
  statusPillResolved: { backgroundColor: colors.successLight },
  statusPillText: { ...typography.caption, fontWeight: '700' },
  statusPillTextOpen: { color: colors.warning || '#B45309' },
  statusPillTextResolved: { color: colors.success },
  pendingText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  typeChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: spacing.sm },
  typeChipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  detailText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 19 },
  detailValue: { color: colors.textPrimary, fontWeight: '700' },

  infoBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.warningLight || '#FEF3C7', borderRadius: radius.md, padding: spacing.sm },
  infoBoxText: { ...typography.caption, color: colors.warning || '#B45309', flex: 1 },

  feedbackThanks: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  feedbackThanksText: { ...typography.bodySmall, color: colors.textSecondary },
});
