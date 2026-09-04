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
        <View style={[styles.contentBody, isDesktop && styles.contentBodyDesktop, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
          
          {/* ACCOUNT OVERVIEW */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>ACCOUNT OVERVIEW</Text>
            <View style={styles.blueBar} />
          </View>

          <Card style={styles.customCard}>
            {/* User Profile Hero Box */}
            <View style={styles.heroBox}>
              <View style={styles.userProfileLeft}>
                <View style={styles.heroAvatar}>
                  <Feather name="user" size={26} color="#1F497D" />
                </View>
                <View>
                  <Text style={styles.heroTitle}>
                    {session?.accountType === 'user' ? 'User Profile' : session?.accountType || 'User'}
                  </Text>
                  <Text style={styles.heroSubtitle}>Registered User Profile</Text>
                </View>
              </View>

              <View style={styles.shieldBadgeContainer}>
                <Feather name="shield" size={32} color="#1F497D" />
                <View style={styles.shieldCheckMark}>
                  <Feather name="check" size={10} color="#FFFFFF" />
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
                    <View style={styles.caseLeftCol}>
                      <View style={styles.caseIconBox}>
                        <Feather name="briefcase" size={18} color="#1F497D" />
                      </View>
                      <View style={styles.casePill}>
                        <Text style={styles.casePillText}>{`CASE ${index + 1}`}</Text>
                      </View>
                    </View>

                    <View style={styles.caseDataGrid}>
                      <View style={styles.caseGridItem}>
                        <Text style={styles.fieldLabel}>Docket ID</Text>
                        <Text style={styles.fieldValueBold}>{docketId}</Text>
                      </View>

                      <View style={[styles.caseGridItem, { flex: 1.5 }]}>
                        <Text style={styles.fieldLabel}>Case Type</Text>
                        <Text style={styles.fieldValueBold}>{caseType}</Text>
                      </View>

                      <View style={styles.caseGridItem}>
                        <Text style={styles.fieldLabel}>Case Stage</Text>
                        <View style={[styles.stageBadge, isRehab ? styles.stageRehab : styles.stageTrial]}>
                          <Feather 
                            name={isRehab ? "users" : "scale"} 
                            size={12} 
                            color={isRehab ? "#6B21A8" : "#15803D"} 
                          />
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
            <View style={styles.blueBar} />
          </View>

          <Card style={styles.customCard}>
            <View style={styles.preferenceRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather name="globe" size={18} color="#1F497D" />
                </View>
                <View>
                  <Text style={styles.prefTitle}>Display Language</Text>
                  <Text style={styles.prefSubtitle}>Select your preferred interface language</Text>
                </View>
              </View>

              <View style={styles.dropdownContainer}>
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
            </View>

            <View style={styles.rowDivider} />

            <View style={styles.preferenceRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather name="mic" size={18} color="#1F497D" />
                </View>
                <View>
                  <Text style={styles.prefTitle}>Speaking Language</Text>
                  <Text style={styles.prefSubtitle}>Language used for voice check-ins and AI calls</Text>
                </View>
              </View>

              <View style={styles.dropdownContainer}>
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
            </View>
          </Card>

          {/* COMMUNICATION PREFERENCES */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>COMMUNICATION PREFERENCES</Text>
            <View style={styles.blueBar} />
          </View>

          <Card style={styles.customCard}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prefTitle}>Prefer a human counsellor</Text>
                <Text style={styles.prefSubtitle}>Get matched with a counsellor for chat & calls</Text>
              </View>
              <Switch
                value={localOptedForCounsellor}
                onValueChange={handleToggleCounsellorPreference}
                disabled={updateCounsellorPreference.isPending}
                trackColor={{ false: '#E2E8F0', true: '#1F497D' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </Card>

          {/* SYSTEM */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>SYSTEM</Text>
            <View style={styles.blueBar} />
          </View>

          <Card style={styles.customCard}>
            <View style={styles.systemRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather name="bell" size={18} color="#1F497D" />
                </View>
                <Text style={styles.prefTitle}>Push Notifications</Text>
              </View>
              <Text style={styles.systemValueText}>Enabled</Text>
            </View>

            <View style={styles.rowDivider} />

            <View style={styles.systemRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather name="info" size={18} color="#64748B" />
                </View>
                <Text style={styles.prefTitle}>App Version</Text>
              </View>
              <Text style={styles.systemValueText}>v2.4.0 (Mansakha Official)</Text>
            </View>
          </Card>

          {/* SECURITY */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>SECURITY</Text>
            <View style={styles.blueBar} />
          </View>

          <Card style={styles.customCard}>
            <View style={styles.preferenceRow}>
              <View style={styles.prefLeft}>
                <View style={styles.prefIconBox}>
                  <Feather name="lock" size={18} color="#1F497D" />
                </View>
                <View>
                  <Text style={styles.prefTitle}>Password</Text>
                  <Text style={styles.prefSubtitle}>Change the password used to sign in</Text>
                </View>
              </View>

              <Pressable
                onPress={() => setShowPasswordForm((v) => !v)}
                style={styles.outlineBtn}
              >
                <Text style={styles.outlineBtnText}>{showPasswordForm ? 'Cancel' : 'Reset Password'}</Text>
              </Pressable>
            </View>

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

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>ACCOUNT</Text>
            <View style={styles.blueBar} />
          </View>
          <LogoutButton variant="row" style={{ marginBottom: spacing.lg }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { flex: 1 },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md, // Reduced side gap
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
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  headerInfo: { flex: 1 },
  pageTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 24, fontWeight: '700' },
  headerRight: { marginLeft: spacing.sm },
  contentBody: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: spacing.md, // Reduced side gap
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
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
    fontSize: 13,
    fontWeight: '700',
    color: '#1F497D',
    letterSpacing: 0.8,
  },
  blueBar: {
    height: 3,
    backgroundColor: '#1F497D',
    width: 28,
    marginTop: 4,
    borderRadius: 2,
  },

  /* Custom Clean Card */
  customCard: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: spacing.md, // Reduced card padding from 24 to 16
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },

  /* Profile Hero Banner */
  heroBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14, // Tighter inner padding
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  userProfileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  shieldBadgeContainer: {
    position: 'relative',
    opacity: 0.9,
  },
  shieldCheckMark: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#1F497D',
    borderRadius: 8,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Horizontal Case Layout */
  caseRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  caseLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 110, // Slightly reduced to fit tighter layouts
  },
  caseIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  casePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  casePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1F497D',
  },
  caseDataGrid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 6,
  },
  caseGridItem: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  fieldValueBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },

  /* Stage Badges */
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 4,
  },
  stageTrial: {
    backgroundColor: '#DCFCE7',
  },
  stageTrialText: {
    color: '#15803D',
    fontWeight: '600',
    fontSize: 11,
  },
  stageRehab: {
    backgroundColor: '#F3E8FF',
  },
  stageRehabText: {
    color: '#6B21A8',
    fontWeight: '600',
    fontSize: 11,
  },

  /* Preference Rows Layout */
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  prefLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  prefIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  prefTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  prefSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  dropdownContainer: {
    width: 180, // Tighter dropdown width
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },

  /* System Cards */
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  systemValueText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
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
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  outlineBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  primaryBtnFilled: {
    backgroundColor: '#1F497D',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnFilledText: { ...typography.bodyStrong, color: colors.white },
  errorText: { ...typography.caption, color: colors.error, marginTop: spacing.sm, textAlign: 'center' },
  successText: { ...typography.caption, color: colors.success, marginTop: spacing.sm, textAlign: 'center' },
});