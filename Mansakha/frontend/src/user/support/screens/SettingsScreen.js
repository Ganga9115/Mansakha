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
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import Dropdown from '../../shared/components/Dropdown';
import IconInput from '../../shared/components/IconInput';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import TopRightActions from '../../shared/components/TopRightActions';
import LogoutButton from '../../shared/components/LogoutButton';

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
  { value: 'mr', label: 'Marathi (मરાઠી)' },
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

  const userName = dashboardQuery.data?.fullName || session?.user?.name || 'Ganga';

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
            <Feather color={colors.primaryDark} name="user" size={24} style={styles.headerIconDesktop}/>
          ) : (
            <View style={styles.avatarContainer}>
              <Feather color={colors.primary} name="user" size={28}/>
            </View>
          )}

          <View style={styles.headerInfo}>
            <Text style={styles.pageTitle}>Profile</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions alertCount={0} fullName={userName} onBellPress={() => {}}/>
          ) : (
            <TopRightActions/>
          )}
        </View>
      </View>

      <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.scrollContent}>
        <View style={styles.contentBody}>
          
          {/* ACCOUNT OVERVIEW */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>ACCOUNT OVERVIEW</Text>
            <View style={styles.blueBar}/>
          </View>

          <Card style={styles.customCard}>
            {/* User Profile Hero Box */}
            <View style={styles.heroBox}>
              <View style={styles.userProfileLeft}>
                <View style={styles.heroAvatar}>
                  <Feather color={colors.primary} name="user" size={24}/>
                </View>
                <View>
                  <Text style={styles.heroTitle}>{userName}</Text>
                  <Text style={styles.heroSubtitle}>Registered User Profile</Text>
                </View>
              </View>

              <View style={styles.shieldBadgeContainer}>
                <Feather color={colors.primaryLight} name="shield" size={40}/>
                <View style={styles.shieldCheckMark}>
                  <Feather color={colors.onPrimary} name="check" size={10}/>
                </View>
              </View>
            </View>

            {/* Linked Cases Horizontal Layout */}
            {casesList.length > 0 ? (
              casesList.map((c, index) => {
                const docketId = c.docketId || c.docketNo || c.caseNumber || 'N/A';
                const caseType = c.caseType || c.type || 'N/A';
                const caseStage = c.caseStage || c.stage || 'Trial';
                const isRehab = caseStage.toLowerCase().includes('rehab');

                return (
                  <View key={c.userId || c.caseNumber || index} style={styles.caseRowContainer}>
                    <View style={styles.caseIconBox}>
                      <Feather color={colors.primary} name="briefcase" size={18}/>
                    </View>

                    <View style={styles.caseDataGrid}>
                      <View style={styles.caseGridItem}>
                        <Text style={styles.fieldLabel}>Docket ID</Text>
                        <Text style={styles.fieldValueBold}>{docketId}</Text>
                      </View>

                      <View style={[styles.caseGridItem, styles.caseTypeWideItem]}>
                        <Text style={styles.fieldLabel}>Case Type</Text>
                        <Text style={styles.fieldValueBold}>{caseType}</Text>
                      </View>

                      <View style={styles.caseGridItem}>
                        <Text style={styles.fieldLabel}>Case Stage</Text>
                        <View style={[styles.stageBadge, isRehab ? styles.stageRehab : styles.stageTrial]}>
                          <Feather color={isRehab ? '#6B21A8' : '#15803D'} name={isRehab ? 'users' : 'scale'} size={12}/>
                          <Text style={[styles.stageBadgeText, isRehab ? styles.stageRehabText : styles.stageTrialText]}>
                            {caseStage}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.caseRowContainer}>
                <Text style={styles.fieldLabel}>No cases linked</Text>
              </View>
            )}
          </Card>

          {/* PREFERENCES */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>PREFERENCES</Text>
            <View style={styles.blueBar}/>
          </View>

          <Card style={styles.customCard}>
            <View style={styles.preferenceRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.primary} name="globe" size={18}/>
                </View>
                <View>
                  <Text style={styles.prefTitle}>Display Language</Text>
                  <Text style={styles.prefSubtitle}>Select your preferred interface language</Text>
                </View>
              </View>

              <View style={styles.dropdownContainer}>
                <Dropdown
                  onChange={async (value) => {
                    setDisplayLanguageId(value);
                    try {
                      await updateLanguage.mutateAsync(value);
                      toast.success('Display language updated.');
                    } catch (err) {
                      toast.error(err.message || 'Could not update language');
                    }
                  }}
                  options={INDIAN_LANGUAGES}
                  value={currentDisplayLanguageId}
                  placeholder="Select interface language"
                  disabled={updateLanguage.isPending}
                />
              </View>
            </View>

            <View style={styles.rowDivider}/>

            <View style={styles.preferenceRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.primary} name="mic" size={18}/>
                </View>
                <View>
                  <Text style={styles.prefTitle}>Speaking Language</Text>
                  <Text style={styles.prefSubtitle}>Language used for voice check-ins and AI calls</Text>
                </View>
              </View>

              <View style={styles.dropdownContainer}>
                <Dropdown
                  onChange={(value) => {
                    setSpeakingLanguageId(value);
                    toast.success('Speaking language updated.');
                  }}
                  options={INDIAN_LANGUAGES}
                  value={currentSpeakingLanguageId}
                  placeholder="Select voice language"
                />
              </View>
            </View>
          </Card>

          {/* COMMUNICATION PREFERENCES */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>COMMUNICATION PREFERENCES</Text>
            <View style={styles.blueBar}/>
          </View>

          <Card style={styles.customCard}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prefTitle}>Prefer a human counsellor</Text>
                <Text style={styles.prefSubtitle}>Get matched with a counsellor for chat & calls</Text>
              </View>
              <Switch
                disabled={updateCounsellorPreference.isPending}
                onValueChange={handleToggleCounsellorPreference}
                thumbColor={colors.white}
                trackColor={{ false: colors.border, true: colors.primary }}
                value={localOptedForCounsellor}
              />
            </View>
          </Card>

          {/* SYSTEM */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>SYSTEM</Text>
            <View style={styles.blueBar}/>
          </View>

          <Card style={styles.customCard}>
            <View style={styles.systemRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.primary} name="bell" size={18}/>
                </View>
                <Text style={styles.prefTitle}>Push Notifications</Text>
              </View>
              <Text style={styles.systemValueText}>Enabled</Text>
            </View>

            <View style={styles.rowDivider}/>

            <View style={styles.systemRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.textSecondary} name="info" size={18}/>
                </View>
                <Text style={styles.prefTitle}>App Version</Text>
              </View>
              <Text style={styles.systemValueText}>v2.4.0 (Mansakha Official)</Text>
            </View>
          </Card>

          {/* SECURITY */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>SECURITY</Text>
            <View style={styles.blueBar}/>
          </View>

          <Card style={styles.customCard}>
            <View style={styles.preferenceRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.primary} name="lock" size={18}/>
                </View>
                <View>
                  <Text style={styles.prefTitle}>Password</Text>
                  <Text style={styles.prefSubtitle}>Change the password used to sign in</Text>
                </View>
              </View>

              <Pressable onPress={() => setShowPasswordForm((v) => !v)} style={styles.outlineBtn}>
                <Text style={styles.outlineBtnText}>{showPasswordForm ? 'Cancel' : 'Reset Password'}</Text>
              </Pressable>
            </View>

            {showPasswordForm && (
              <View style={{ marginTop: spacing.md }}>
                <IconInput
                  blurOnSubmit={false}
                  icon="lock"
                  onChangeText={setNewPassword}
                  onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                  placeholder="New password (min 8 characters)"
                  returnKeyType="next"
                  secureTextEntry
                  value={newPassword}
                />
                <IconInput
                  icon="lock"
                  onChangeText={setConfirmPassword}
                  onSubmitEditing={handleConfirmPasswordSubmit}
                  placeholder="Confirm new password"
                  ref={confirmPasswordInputRef}
                  returnKeyType="done"
                  secureTextEntry
                  value={confirmPassword}
                />
                {passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
                {passwordSuccess && <Text style={styles.successText}>Password updated.</Text>}
                <Pressable disabled={passwordLoading} onPress={handleChangePassword} style={styles.primaryBtnFilled}>
                  <Text style={styles.primaryBtnFilledText}>
                    {passwordLoading ? 'Updating...' : 'Confirm New Password'}
                  </Text>
                </Pressable>
              </View>
            )}
          </Card>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>ACCOUNT</Text>
            <View style={styles.blueBar}/>
          </View>
          <LogoutButton style={{ marginBottom: spacing.lg }} variant="row"/>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.background 
  },
  scrollContent: { 
    flex: 1 
  },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: 36, // Exactly 1 cm horizontal gap on both sides (approx 36px)
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
  headerIconDesktop: { 
    marginRight: spacing.sm 
  },
  headerLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1 
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  headerInfo: { 
    flex: 1 
  },
  pageTitle: { 
    ...typography.h1, 
    color: colors.primaryDark 
  },
  headerRight: { 
    marginLeft: spacing.sm 
  },
  contentBody: {
    backgroundColor: colors.background,
    paddingHorizontal: 36, // Exactly 1 cm horizontal gap on both left and right sides
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    width: '100%',
  },
  contentBodyDesktop: {
    marginTop: 0,
  },

  /* Section Titles */
  sectionHeaderWrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  sectionHeaderTitle: {
    ...typography.label,
    color: colors.primaryDark,
  },
  blueBar: {
    height: 3,
    backgroundColor: colors.primary,
    width: 24,
    marginTop: 4,
    borderRadius: 2,
  },

  /* Custom Clean Card */
  customCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },

  /* Profile Hero Banner */
  heroBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  userProfileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  heroTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  shieldBadgeContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shieldCheckMark: {
    position: 'absolute',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Horizontal Case Layout */
  caseRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  caseIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  caseDataGrid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caseGridItem: {
    flex: 1,
  },
  caseTypeWideItem: {
    flex: 2,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  fieldValueBold: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },

  /* Stage Badges */
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    gap: 4,
  },
  stageTrial: {
    backgroundColor: colors.successLight,
  },
  stageTrialText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '600',
  },
  stageRehab: {
    backgroundColor: colors.infoLight,
  },
  stageRehabText: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
  },

  /* Preference Rows Layout */
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  prefLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.xs,
  },
  prefIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  prefTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  prefSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dropdownContainer: {
    width: 180,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },

  /* System Cards */
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  systemValueText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },

  /* Toggle Row */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  /* Buttons */
  outlineBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  outlineBtnText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  primaryBtnFilled: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnFilledText: { 
    ...typography.bodyStrong, 
    color: colors.onPrimary 
  },
  errorText: { 
    ...typography.caption, 
    color: colors.danger, 
    marginTop: spacing.sm, 
    textAlign: 'center' 
  },
  successText: { 
    ...typography.caption, 
    color: colors.success, 
    marginTop: spacing.sm, 
    textAlign: 'center' 
  },
});