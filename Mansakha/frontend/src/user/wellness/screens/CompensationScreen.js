import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, TextInput } from 'react-native';
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
import { useUserDashboard, useCompensationStatus, useBankDetails, useSaveBankDetails } from '../../shared/services/hooks';

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


// migration_038 - compensation is paid by direct bank transfer (DBT), so the
// victim has to be able to say where. Without this the District Welfare
// Officer can verify an amount but has no account to send it to - and their
// Mark Paid action is now blocked until this exists.
function BankDetailsCard() {
  const query = useBankDetails();
  const save = useSaveBankDetails();
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const d = query.data;

  useEffect(() => {
    if (!d) return;
    setAccountName(d.accountName || '');
    setAccountNumber(d.accountNumber || '');
    setIfsc(d.ifsc || '');
    setBankName(d.bankName || '');
  }, [d?.accountName, d?.accountNumber, d?.ifsc, d?.bankName]);

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({ accountName, accountNumber, ifsc, bankName });
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Could not save your bank details.');
    }
  };

  if (query.isLoading) return null;

  const hasDetails = !!d?.hasDetails;

  return (
    <Card headerTitle="Bank Account for Payment">
      <Text style={styles.bankIntro}>
        Your compensation is paid directly into your bank account. Kindly make sure these details are correct.
      </Text>

      {hasDetails && !editing ? (
        <>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>Account Holder</Text>
            <Text style={styles.bankValue}>{d.accountName}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>Account Number</Text>
            <Text style={styles.bankValue}>{d.accountNumber}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>IFSC</Text>
            <Text style={styles.bankValue}>{d.ifsc}</Text>
          </View>
          {!!d.bankName && (
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>Bank</Text>
              <Text style={styles.bankValue}>{d.bankName}</Text>
            </View>
          )}
          <Pressable style={styles.bankEditBtn} onPress={() => setEditing(true)}>
            <Feather name="edit-2" size={13} color={colors.primaryDark} />
            <Text style={styles.bankEditBtnText}>Update details</Text>
          </Pressable>
        </>
      ) : (
        <>
          {!hasDetails && (
            <View style={styles.bankWarning}>
              <Feather name="alert-circle" size={14} color={colors.warning} />
              <Text style={styles.bankWarningText}>
                No account added yet - your compensation cannot be paid out until you add one.
              </Text>
            </View>
          )}
          <Text style={styles.bankFieldLabel}>Account Holder Name</Text>
          <TextInput style={styles.bankInput} value={accountName} onChangeText={setAccountName} placeholder="As printed in your passbook" />
          <Text style={styles.bankFieldLabel}>Account Number</Text>
          <TextInput style={styles.bankInput} value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" placeholder="9-18 digits" />
          <Text style={styles.bankFieldLabel}>IFSC Code</Text>
          <TextInput style={styles.bankInput} value={ifsc} onChangeText={(t) => setIfsc(t.toUpperCase())} autoCapitalize="characters" placeholder="e.g. SBIN0001234" />
          <Text style={styles.bankFieldLabel}>Bank Name (optional)</Text>
          <TextInput style={styles.bankInput} value={bankName} onChangeText={setBankName} placeholder="e.g. State Bank of India" />

          {error && <Text style={styles.bankError}>{error}</Text>}

          <Pressable
            style={[styles.bankSaveBtn, save.isPending && styles.bankSaveBtnDisabled]}
            onPress={handleSave}
            disabled={save.isPending}
          >
            <Text style={styles.bankSaveBtnText}>{save.isPending ? 'Saving...' : 'Save Bank Details'}</Text>
          </Pressable>
        </>
      )}

      {saved && <Text style={styles.bankSaved}>Saved - your compensation will be paid into this account.</Text>}
    </Card>
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
          <BankDetailsCard />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bankIntro: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.md },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs, gap: spacing.md },
  bankLabel: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  bankValue: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13, flex: 1.4, textAlign: 'right' },
  bankFieldLabel: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: 4 },
  bankInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    ...typography.body, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.surface,
  },
  bankWarning: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.warningLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  bankWarningText: { ...typography.caption, color: colors.warning, flex: 1, lineHeight: 16 },
  bankError: { ...typography.bodySmall, color: colors.danger, marginTop: spacing.sm },
  bankSaved: { ...typography.bodySmall, color: colors.success, marginTop: spacing.sm },
  bankSaveBtn: {
    backgroundColor: colors.primaryDark, borderRadius: radius.lg,
    paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md,
  },
  bankSaveBtnDisabled: { opacity: 0.6 },
  bankSaveBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 14 },
  bankEditBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  bankEditBtnText: { ...typography.caption, color: colors.primaryDark, fontWeight: '700' },
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
