import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary } from '../../shared/components/QueryStates';
import * as ImagePicker from 'expo-image-picker';
import { useUserDashboard, useCompensationStatus, useBankDetails, useSaveBankDetails, useUploadBankProof } from '../../shared/services/hooks';

function inr(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

function StageRow({ stage }) {
  const isPaid = stage.status === 'Paid';
  return (
    <View style={[styles.stageRow, isPaid && styles.stageRowPaid, !stage.unlocked && styles.stageRowLocked]}>
      <View style={{ flex: 1, paddingRight: spacing.xs }}>
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
  const { isDesktop } = useResponsive();

  return (
    <>
      <View style={styles.cardContainer}>
        <View style={[styles.cardHeaderTop, !isDesktop && styles.cardHeaderTopMobile]}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.blueIconTile}>
              <Feather name="credit-card" size={18} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Statutory Compensation</Text>
              <Text style={styles.categoryText}>{data.statutoryCategory}</Text>
            </View>
          </View>

          <View style={[
            styles.statusPill,
            data.verified ? styles.verifiedPill : styles.pendingPill,
            !isDesktop && styles.statusPillMobile
          ]}>
            <View style={[styles.statusDot, data.verified ? styles.verifiedDot : styles.pendingDot]} />
            <Text style={[styles.statusPillText, data.verified ? styles.verifiedText : styles.pendingText]}>
              {data.verified ? 'Verified' : 'Pending Verification'}
            </Text>
          </View>
        </View>

        <Text style={styles.amountText}>{inr(data.verified ? data.verifiedAmount : data.suggestedAmount)}</Text>
        <Text style={styles.introText}>
          {data.verified
            ? 'This amount has been verified by the District Welfare Officer and is being tracked below.'
            : 'This is an automatically suggested amount based on your case type. It will be verified by the District Welfare Officer.'}
        </Text>
      </View>

      <View style={styles.infoBanner}>
        <View style={styles.infoIconTile}>
          <Feather name="info" size={16} color={colors.primaryDark} />
        </View>
        <Text style={styles.infoBannerText}>
          This compensation is provided as per the scheme guidelines and is subject to verification by the District Welfare Officer.
        </Text>
      </View>

      {data.verified && data.stages && (
        <View style={styles.cardContainer}>
          <Text style={styles.cardTitle}>Payment Stages</Text>
          <Text style={styles.introText}>Compensation is released in stages as your case progresses through the legal process.</Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {data.stages.map((s) => (
              <StageRow key={s.stage} stage={s} />
            ))}
          </View>
        </View>
      )}
    </>
  );
}

function BankDetailsCard() {
  const { isDesktop } = useResponsive();
  const query = useBankDetails();
  const save = useSaveBankDetails();
  const uploadProof = useUploadBankProof();
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

  const handlePickProof = async () => {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      await uploadProof.mutateAsync({ uri: asset.uri, mimeType: asset.mimeType });
    } catch (err) {
      setError(err.message || 'Could not upload that file.');
    }
  };

  if (query.isLoading) return null;

  const hasDetails = !!d?.hasDetails;

  return (
    <View style={styles.cardContainer}>
      <View style={styles.bankCardHeader}>
        <View style={styles.blueIconTile}>
          <Feather name="home" size={18} color={colors.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Bank Account Details</Text>
          <Text style={styles.bankIntro}>
            Your compensation is paid directly into your bank account. Kindly make sure these details are correct.
          </Text>
        </View>
      </View>

      {hasDetails && !editing ? (
        <View style={styles.savedDetailsBox}>
          <View style={[styles.bankGridRow, !isDesktop && styles.bankGridRowMobile]}>
            <View style={styles.bankGridCell}>
              <Text style={styles.bankFieldLabel}>Account Holder Name</Text>
              <Text style={styles.bankDisplayValue}>{d.accountName}</Text>
            </View>
            <View style={styles.bankGridCell}>
              <Text style={styles.bankFieldLabel}>Account Number</Text>
              <Text style={styles.bankDisplayValue}>{d.accountNumber}</Text>
            </View>
          </View>

          <View style={[styles.bankGridRow, !isDesktop && styles.bankGridRowMobile]}>
            <View style={styles.bankGridCell}>
              <Text style={styles.bankFieldLabel}>IFSC Code</Text>
              <Text style={styles.bankDisplayValue}>{d.ifsc}</Text>
            </View>
            <View style={styles.bankGridCell}>
              <Text style={styles.bankFieldLabel}>Bank Name</Text>
              <Text style={styles.bankDisplayValue}>{d.bankName || 'N/A'}</Text>
            </View>
          </View>

          <Pressable style={styles.bankEditBtn} onPress={() => setEditing(true)}>
            <Feather name="edit-2" size={13} color={colors.primaryDark} />
            <Text style={styles.bankEditBtnText}>Update details</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {!hasDetails && (
            <View style={styles.bankWarning}>
              <View style={styles.warningIconCircle}>
                <Feather name="info" size={14} color={colors.warning || '#D97706'} />
              </View>
              <Text style={styles.bankWarningText}>
                No account added yet - your compensation cannot be paid out until you add one.
              </Text>
            </View>
          )}

          <View style={[styles.bankGridRow, !isDesktop && styles.bankGridRowMobile]}>
            <View style={styles.bankGridCell}>
              <Text style={styles.bankFieldLabel}>Account Holder Name</Text>
              <View style={styles.inputWrapper}>
                <Feather name="user" size={16} color={colors.primaryDark} style={styles.inputIcon} />
                <TextInput
                  style={styles.bankInput}
                  value={accountName}
                  onChangeText={setAccountName}
                  placeholder="As printed in passbook"
                  placeholderTextColor={colors.textSecondary || '#94A3B8'}
                />
              </View>
            </View>

            <View style={styles.bankGridCell}>
              <Text style={styles.bankFieldLabel}>Account Number</Text>
              <View style={styles.inputWrapper}>
                <Feather name="credit-card" size={16} color={colors.primaryDark} style={styles.inputIcon} />
                <TextInput
                  style={styles.bankInput}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="number-pad"
                  placeholder="9-18 digits"
                  placeholderTextColor={colors.textSecondary || '#94A3B8'}
                />
              </View>
            </View>
          </View>

          <View style={[styles.bankGridRow, !isDesktop && styles.bankGridRowMobile]}>
            <View style={styles.bankGridCell}>
              <Text style={styles.bankFieldLabel}>IFSC Code</Text>
              <View style={styles.inputWrapper}>
                <Feather name="home" size={16} color={colors.primaryDark} style={styles.inputIcon} />
                <TextInput
                  style={styles.bankInput}
                  value={ifsc}
                  onChangeText={(t) => setIfsc(t.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder="e.g. SBIN0001234"
                  placeholderTextColor={colors.textSecondary || '#94A3B8'}
                />
              </View>
            </View>

            <View style={styles.bankGridCell}>
              <Text style={styles.bankFieldLabel}>Bank Name (optional)</Text>
              <View style={styles.inputWrapper}>
                <Feather name="home" size={16} color={colors.primaryDark} style={styles.inputIcon} />
                <TextInput
                  style={styles.bankInput}
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="e.g. State Bank of India"
                  placeholderTextColor={colors.textSecondary || '#94A3B8'}
                />
              </View>
            </View>
          </View>

          {error && <Text style={styles.bankError}>{error}</Text>}

          <Pressable
            style={[styles.bankSaveBtn, save.isPending && styles.bankSaveBtnDisabled]}
            onPress={handleSave}
            disabled={save.isPending}
          >
            <Feather name="home" size={16} color={colors.onPrimary || '#FFFFFF'} style={{ marginRight: 8 }} />
            <Text style={styles.bankSaveBtnText}>{save.isPending ? 'Saving...' : 'Save Bank Details'}</Text>
          </Pressable>
        </>
      )}

      <View style={[styles.bankProofRow, !isDesktop && styles.bankProofRowMobile]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bankProofLabel}>Passbook / cancelled cheque (optional)</Text>
          <Text style={styles.bankProofHint}>
            {d?.proofUrl ? 'Uploaded - the Welfare Officer can view this.' : 'Helps the Welfare Officer verify your account faster.'}
          </Text>
        </View>
        <Pressable style={styles.bankProofBtn} onPress={handlePickProof} disabled={uploadProof.isPending}>
          <Feather name={d?.proofUrl ? 'refresh-cw' : 'upload'} size={13} color={colors.primaryDark} />
          <Text style={styles.bankProofBtnText}>
            {uploadProof.isPending ? 'Uploading...' : d?.proofUrl ? 'Replace' : 'Upload'}
          </Text>
        </Pressable>
      </View>

      {saved && <Text style={styles.bankSaved}>Saved - your compensation will be paid into this account.</Text>}
    </View>
  );
}

export default function CompensationScreen({ navigation, route }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
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
            <Feather name="credit-card" size={20} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Compensation</Text>
        </View>
        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions fullName={dashboardQuery.data?.fullName} alertCount={dashboardQuery.data?.alerts?.length || 0} onBellPress={() => { }} />
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
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1, backgroundColor: colors.background },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0, paddingHorizontal: spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerRight: { marginLeft: spacing.sm },
  backBtn: { marginRight: spacing.xs, padding: spacing.xs },
  headerIconTile: { alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs },
  headerTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 18, fontWeight: '700' },
  body: { width: '100%', paddingHorizontal: spacing.md, paddingVertical: spacing.md, maxWidth: 1080, alignSelf: 'center' },

  cardContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg || 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeaderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  cardHeaderTopMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  blueIconTile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    ...typography.h3,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  categoryText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  statusPillMobile: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  pendingPill: {
    backgroundColor: colors.successLight || '#E6F4EA',
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  pendingText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
  verifiedPill: {
    backgroundColor: colors.successLight || '#DCFCE7',
  },
  verifiedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  verifiedText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },

  amountText: {
    ...typography.h1,
    fontSize: 26,
    fontWeight: '800',
    color: colors.primaryDark,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  introText: {
    ...typography.bodySmall,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  infoIconTile: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoBannerText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.primaryDark,
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },

  bankCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  bankIntro: {
    ...typography.bodySmall,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  bankWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningLight || '#FEF8E7',
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
    gap: 8,
  },
  warningIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bankWarningText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.warning || '#D97706',
    flex: 1,
    fontWeight: '500',
    lineHeight: 16,
  },

  bankGridRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  bankGridRowMobile: {
    flexDirection: 'column',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  bankGridCell: {
    flex: 1,
  },
  bankFieldLabel: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  inputIcon: {
    marginRight: 6,
  },
  bankInput: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  bankDisplayValue: {
    ...typography.bodyStrong,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  savedDetailsBox: {
    marginTop: spacing.xs,
  },

  bankSaveBtn: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  bankSaveBtnDisabled: { opacity: 0.6 },
  bankSaveBtnText: { color: colors.onPrimary || '#FFFFFF', fontWeight: '700', fontSize: 13 },

  bankEditBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  bankEditBtnText: { ...typography.caption, fontSize: 12, color: colors.primaryDark, fontWeight: '700' },

  bankProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bankProofRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.xs,
  },
  bankProofLabel: { ...typography.caption, fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
  bankProofHint: { ...typography.caption, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  bankProofBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primaryDark,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: spacing.xs,
  },
  bankProofBtnText: { ...typography.caption, fontSize: 12, color: colors.primaryDark, fontWeight: '700' },

  bankError: { ...typography.bodySmall, fontSize: 12, color: colors.danger, marginTop: spacing.xs, marginBottom: spacing.xs },
  bankSaved: { ...typography.bodySmall, fontSize: 12, color: colors.success, marginTop: spacing.xs },

  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  stageRowPaid: { backgroundColor: colors.successLight, borderColor: colors.success },
  stageRowLocked: { opacity: 0.6 },
  stageName: { ...typography.bodySmall, fontSize: 13, color: colors.textPrimary, fontWeight: '700' },
  stageMeta: { ...typography.caption, fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  stageBadgePaid: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stageBadgePaidText: { ...typography.caption, fontSize: 12, color: colors.success, fontWeight: '700' },
  stageBadgePending: { backgroundColor: colors.warningLight || '#FEF3C7', borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: spacing.sm },
  stageBadgePendingText: { ...typography.caption, fontSize: 12, color: colors.warning || '#9A5B06', fontWeight: '700' },
  stageBadgeLocked: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stageBadgeLockedText: { ...typography.caption, fontSize: 12, color: colors.textSecondary, fontWeight: '700' },
});