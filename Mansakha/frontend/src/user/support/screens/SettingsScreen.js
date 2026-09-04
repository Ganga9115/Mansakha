import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../shared/context/AuthContext';
import { useToast } from '../../shared/context/ToastContext';
import {
  useUserDashboard,
  useLanguageOptions,
  useUpdateUserLanguage,
  useAssignedCounsellor,
  useUpdateCounsellorPreference,
} from '../../shared/services/hooks';
import { apiClient } from '../../shared/services/apiClient';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { shadow } from '../../shared/theme/shadow';
import { formContentWidth } from '../../shared/theme/layout';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import Dropdown from '../../shared/components/Dropdown';
import IconInput from '../../shared/components/IconInput';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';
import LogoutButton from '../../shared/components/LogoutButton';
import { Skeleton } from '../../shared/components/Skeleton';

function InfoTileRow({ icon, label, value, loading, iconColor = colors.primary, isLast = false }) {
  return (
    <View style={[styles.infoTileRow, !isLast && styles.rowBorder]}>
      <View style={styles.tileIconContainer}>
        <Feather name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.tileTextWrap}>
        <Text style={styles.tileLabel}>{label}</Text>
        {loading ? (
          <Skeleton width={120} height={14} />
        ) : (
          <Text style={styles.tileValue}>{value}</Text>
        )}
      </View>
    </View>
  );
}

const INDIAN_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'as', label: 'Assamese (অসমীয়া)' },
  { value: 'bn', label: 'Bengali (বাংলা)' },
  { value: 'brx', label: 'Bodo (बड़ो)' },
  { value: 'doi', label: 'Dogri (डोगरी)' },
  { value: 'gu', label: 'Gujarati (ગુજરાતી)' },
  { value: 'hi', label: 'Hindi (हिन्दी)' },
  { value: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
  { value: 'ks', label: 'Kashmiri (كأشُر)' },
  { value: 'gom', label: 'Konkani (कोंकणी)' },
  { value: 'mai', label: 'Maithili (मैथिली)' },
  { value: 'ml', label: 'Malayalam (മലയാളം)' },
  { value: 'mni', label: 'Manipuri (মৈতৈলোন্)' },
  { value: 'mr', label: 'Marathi (মરાઠી)' },
  { value: 'ne', label: 'Nepali (नेपाली)' },
  { value: 'or', label: 'Odia (ଓଡ଼ିଆ)' },
  { value: 'pa', label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { value: 'sa', label: 'Sanskrit (সংસ્કૃતમ્)' },
  { value: 'sat', label: 'Santali (ᱥᱟᱱᱛᱟᱲᱤ)' },
  { value: 'sd', label: 'Sindhi (سنڌي)' },
  { value: 'ta', label: 'Tamil (தமிழ்)' },
  { value: 'te', label: 'Telugu (తెలుగు)' },
  { value: 'ur', label: 'Urdu (اردو)' },
];

export default function SettingsScreen({ navigation }) {
  const { session } = useAuth();
  const toast = useToast();
  const dashboardQuery = useUserDashboard();
  const languagesQuery = useLanguageOptions();
  const updateLanguage = useUpdateUserLanguage();
  const assignedCounsellorQuery = useAssignedCounsellor();
  const updateCounsellorPreference = useUpdateCounsellorPreference();
  const [displayLanguageId, setDisplayLanguageId] = useState(null);
  const [speakingLanguageId, setSpeakingLanguageId] = useState(null);
  const { tier, isDesktop } = useResponsive();

  const [localOptedForCounsellor, setLocalOptedForCounsellor] = useState(false);

  React.useEffect(() => {
    if (dashboardQuery.data) {
      setLocalOptedForCounsellor(dashboardQuery.data.optedForManualCounsellor ?? false);
    }
  }, [dashboardQuery.data]);

  const hasAssignedCounsellor = !!assignedCounsellorQuery.data?.assigned;

  const handleToggleCounsellorPreference = async (value) => {
    setLocalOptedForCounsellor(value);
    try {
      await updateCounsellorPreference.mutateAsync(value);
      await Promise.all([assignedCounsellorQuery.refetch(), dashboardQuery.refetch()]);
      toast.success(value ? 'Assigned to a human counsellor.' : 'Counsellor preference updated.');
    } catch (err) {
      setLocalOptedForCounsellor(!value);
      toast.error(err.message || 'Could not update this preference.');
    }
  };

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const confirmPasswordInputRef = useRef(null);

  const currentDisplayLanguageId = displayLanguageId ?? dashboardQuery.data?.preferredLanguageId ?? 'en';
  const currentSpeakingLanguageId = speakingLanguageId ?? 'en';

  const handleConfirmPasswordSubmit = () => {
    if (newPassword.trim() && confirmPassword.trim()) {
      handleChangePassword();
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordLoading(true);
    try {
      await apiClient.post('/api/auth/user/change-password', { newPassword }, session?.token);
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setShowPasswordForm(false); setPasswordSuccess(false); }, 1500);
    } catch (err) {
      toast.error(err.message || 'Could not update your password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const casesList = dashboardQuery.data?.linkedCases?.length
    ? dashboardQuery.data.linkedCases
    : dashboardQuery.data?.caseStatus
    ? [dashboardQuery.data.caseStatus]
    : [];

  return (
    <View style={styles.container}>
      {/* Sticky Blue Header Section */}
      <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
        <View style={styles.headerLeft}>
          {isDesktop ? (
            <Feather name="user" size={24} color={colors.primaryDark} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              <Feather name="user" size={28} color={colors.primary} />
            </View>
          )}

          <View style={styles.headerInfo}>
            <Text style={styles.pageTitle}>Profile</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions
              fullName={dashboardQuery.data?.fullName}
              alertCount={0}
              onBellPress={() => {}}
            />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollContent} bounces={false} showsVerticalScrollIndicator={false}>
        {/* Main Rounded Body Area */}
        <View style={[styles.contentBody, isDesktop && styles.contentBodyDesktop, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
          {/* Account Details Card */}
          <Text style={styles.sectionHeaderTitle}>ACCOUNT OVERVIEW</Text>
          <Card style={styles.customCard}>
            <View style={styles.cardHeader}>
              <View style={styles.accountIconTile}>
                <Feather name="user-check" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardHeaderTitle}>
                  {session?.accountType === 'user' ? 'User Profile' : session?.accountType || 'User'}
                </Text>
                <Text style={styles.cardHeaderSubtitle}>Registered User Profile</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Renders cases displaying Docket ID, Case Type, and Case Stage */}
            {casesList.length > 0 ? (
              casesList.map((c, index) => {
                const docketId = c.docketId || c.docketNo || c.caseNumber || 'N/A';
                const caseType = c.caseType || c.type || 'N/A';
                const caseStage = c.caseStage || c.stage || 'Trial';

                return (
                  <View
                    key={c.userId || c.caseNumber || index}
                    style={[styles.infoTileRow, index !== casesList.length - 1 && styles.rowBorder]}
                  >
                    <View style={styles.tileIconContainer}>
                      <Feather name="briefcase" size={18} color={colors.primary} />
                    </View>
                    <View style={styles.tileTextWrap}>
                      <Text style={styles.tileLabel}>{`CASE ${index + 1}`}</Text>
                      {dashboardQuery.isLoading ? (
                        <Skeleton width={120} height={14} />
                      ) : (
                        <View style={styles.caseDetailsColumn}>
                          <Text style={styles.tileValue}>{`Docket ID : ${docketId}`}</Text>
                          <Text style={styles.tileValue}>{`Case Type : ${caseType}`}</Text>
                          <Text style={styles.tileValue}>{`Case Stage : ${caseStage}`}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              <InfoTileRow
                icon="briefcase"
                label="Case Status"
                loading={dashboardQuery.isLoading}
                value="No cases linked"
                isLast
              />
            )}
          </Card>

          {/* Preferences Section */}
          <Text style={styles.sectionHeaderTitle}>PREFERENCES</Text>
          <Card style={styles.customCard}>
            <View style={styles.cardHeader}>
              <View style={styles.accountIconTile}>
                <Feather name="globe" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardHeaderTitle}>Display Language</Text>
                <Text style={styles.cardHeaderSubtitle}>Select your preferred interface language</Text>
              </View>
            </View>
            <View style={{ marginTop: spacing.md, marginBottom: spacing.xl }}>
              <Dropdown
                options={INDIAN_LANGUAGES}
                value={currentDisplayLanguageId}
                onChange={async (value) => {
                  setDisplayLanguageId(value);
                  try {
                    await updateLanguage.mutateAsync(value);
                    toast.success('Display language updated.');
                  } catch (err) {
                    toast.error(err.message || 'Could not update language');
                  }
                }}
                placeholder="Select interface language"
                disabled={updateLanguage.isPending}
              />
            </View>

            <View style={styles.divider} />

            <View style={[styles.cardHeader, { marginTop: spacing.md }]}>
              <View style={styles.accountIconTile}>
                <Feather name="mic" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardHeaderTitle}>Speaking Language</Text>
                <Text style={styles.cardHeaderSubtitle}>Language used for voice check-ins and AI calls</Text>
              </View>
            </View>
            <View style={{ marginTop: spacing.md }}>
              <Dropdown
                options={INDIAN_LANGUAGES}
                value={currentSpeakingLanguageId}
                onChange={(value) => {
                  setSpeakingLanguageId(value);
                  toast.success('Speaking language updated.');
                }}
                placeholder="Select voice language"
              />
            </View>
          </Card>

          {/* Communication Preferences */}
          <Text style={styles.sectionHeaderTitle}>COMMUNICATION PREFERENCES</Text>
          <Card style={styles.customCard}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardHeaderTitle}>Prefer a human counsellor</Text>
                <Text style={styles.cardHeaderSubtitle}>Get matched with a counsellor for chat & calls</Text>
              </View>
              <Switch
                value={localOptedForCounsellor}
                onValueChange={handleToggleCounsellorPreference}
                disabled={updateCounsellorPreference.isPending}
                trackColor={{ true: colors.primary }}
              />
            </View>
          </Card>

          {!localOptedForCounsellor && (
            <Card style={[styles.customCard, styles.counsellorInviteCard]}>
              <Feather name="user-plus" size={20} color={colors.primary} style={{ marginBottom: spacing.xs }} />
              <Text style={styles.cardHeaderTitle}>Want to talk to someone?</Text>
              <Text style={styles.cardHeaderSubtitle}>
                Turn on "Prefer a human counsellor" above to get matched with a real counsellor you can message or call directly.
              </Text>
            </Card>
          )}

          {localOptedForCounsellor && !hasAssignedCounsellor && (
            <Card style={[styles.customCard, styles.counsellorInviteCard]}>
              <Feather name="clock" size={20} color={colors.primary} style={{ marginBottom: spacing.xs }} />
              <Text style={styles.cardHeaderTitle}>Finding you a counsellor</Text>
              <Text style={styles.cardHeaderSubtitle}>
                You're opted in - we'll connect you with a counsellor as soon as one is available in your area.
              </Text>
            </Card>
          )}

          {/* Notifications & System Info Card */}
          <Text style={styles.sectionHeaderTitle}>SYSTEM</Text>
          <Card style={styles.customCard}>
            <InfoTileRow
              icon="bell"
              label="Push Notifications"
              value="Enabled"
              iconColor={colors.primary}
            />
            <InfoTileRow
              icon="info"
              label="App Version"
              value="v2.4.0 (Mansakha Official)"
              iconColor={colors.textSecondary}
              isLast
            />
          </Card>

          {/* Security Card - Reset Password */}
          <Text style={styles.sectionHeaderTitle}>SECURITY</Text>
          <Card style={styles.customCard}>
            <View style={styles.cardHeader}>
              <View style={styles.accountIconTile}>
                <Feather name="lock" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardHeaderTitle}>Password</Text>
                <Text style={styles.cardHeaderSubtitle}>Change the password used to sign in</Text>
              </View>
            </View>

            <Pressable
              onPress={() => setShowPasswordForm((v) => !v)}
              style={[styles.outlineBtn, { marginTop: spacing.md }]}
            >
              <Text style={styles.outlineBtnText}>{showPasswordForm ? 'Cancel' : 'Reset Password'}</Text>
            </Pressable>

            {showPasswordForm && (
              <View style={{ marginTop: spacing.md }}>
                <IconInput
                  icon="lock"
                  placeholder="New password (min 8 characters)"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                />
                <IconInput
                  ref={confirmPasswordInputRef}
                  icon="lock"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleConfirmPasswordSubmit}
                />
                {passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
                {passwordSuccess && <Text style={styles.successText}>Password updated.</Text>}
                <Pressable
                  style={styles.primaryBtnFilled}
                  onPress={handleChangePassword}
                  disabled={passwordLoading}
                >
                  <Text style={styles.primaryBtnFilledText}>
                    {passwordLoading ? 'Updating...' : 'Confirm New Password'}
                  </Text>
                </Pressable>
              </View>
            )}
          </Card>

          <Text style={styles.sectionHeaderTitle}>ACCOUNT</Text>
          <LogoutButton variant="row" style={{ marginBottom: spacing.lg }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flex: 1 },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 10,
  },
  topHeaderDesktop: {
    height: 64,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: 'center',
  },
  headerIconDesktop: { marginRight: spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
  },
  avatarContainerDesktop: { width: 40, height: 40 },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primaryDark,
    borderRadius: radius.pill,
    padding: 3,
  },
  headerInfo: { flex: 1 },
  pillBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  pillText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  pageTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 24, fontWeight: '700' },
  subtext: { ...typography.caption, color: colors.textSecondary },
  headerRight: { marginLeft: spacing.md },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentBody: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  contentBodyDesktop: {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  sectionHeaderTitle: {
    ...typography.label,
    color: colors.primaryDark,
    marginBottom: spacing.xs,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  customCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  counsellorInviteCard: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
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
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  infoTileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  rowBorder: { borderBottomWidth: 1, borderColor: colors.border, paddingBottom: spacing.sm, marginBottom: spacing.sm },
  tileIconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  tileTextWrap: { flex: 1 },
  tileLabel: { ...typography.caption, color: colors.textSecondary, textTransform: 'uppercase' },
  tileValue: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: 2 },
  caseDetailsColumn: { marginTop: 2, gap: 2 },
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
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  halfBtn: { flex: 1 },
  primaryBtnFilled: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnFilledText: { ...typography.bodyStrong, color: colors.white },
  errorText: { ...typography.caption, color: colors.error, marginTop: spacing.sm, textAlign: 'center' },
  successText: { ...typography.caption, color: colors.success, marginTop: spacing.sm, textAlign: 'center' },
});