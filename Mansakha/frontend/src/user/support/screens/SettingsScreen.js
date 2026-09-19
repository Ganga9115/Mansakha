import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../shared/context/AuthContext';
import { useToast } from '../../shared/context/ToastContext';
import { useActiveCase } from '../../shared/context/ActiveCaseContext';
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
import BottomNavBar from '../../shared/components/BottomNavBar';

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
  { value: 'mr', label: 'Marathi (મરાઠી)' },
  { value: 'ne', label: 'Nepali (ਨੇपाली)' },
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
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();

  const [localOptedForCounsellor, setLocalOptedForCounsellor] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // This is the ONE place in the app a docket gets picked (see
  // ActiveCaseContext.js) - every other case-scoped screen just reads
  // activeCaseUserId from context and reacts.
  const { activeCaseUserId, setActiveCaseUserId } = useActiveCase();

  const casesList = dashboardQuery.data?.linkedCases?.length
    ? dashboardQuery.data.linkedCases
    : dashboardQuery.data?.caseStatus
      ? [{ ...dashboardQuery.data.caseStatus, docketNumber: dashboardQuery.data.docketNumber }]
      : [];

  const handleSelectDocket = (item) => {
    setActiveCaseUserId(item.userId || null);
  };

  useEffect(() => {
    if (dashboardQuery.data) {
      setLocalOptedForCounsellor(dashboardQuery.data.optedForManualCounsellor ?? false);
      if (dashboardQuery.data.avatarUrl || dashboardQuery.data.profileImage) {
        setProfileImageUri(dashboardQuery.data.avatarUrl || dashboardQuery.data.profileImage);
      }
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

  // GET /api/user/language expects the real languages.language_id (a uuid) -
  // this dropdown used to render INDIAN_LANGUAGES's own short codes ('en',
  // 'hi', ...) as both its options AND its default value, so picking
  // anything (or even just the unset default) sent a plain string where a
  // uuid was required and the update always failed ("invalid input syntax
  // for type uuid: 'en'"). languageOptions below is the real, backend-
  // provided list; defaulting to null (not 'en') so the dropdown shows its
  // placeholder instead of a fake selection when nothing is set yet.
  const languageOptions = (languagesQuery.data?.languages || []).map((l) => ({ value: l.language_id, label: l.name }));
  const currentDisplayLanguageId = displayLanguageId ?? dashboardQuery.data?.preferredLanguageId ?? null;
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

  const selectedCase = casesList.find((c) => c.userId === activeCaseUserId) || casesList[0];

  return (
    <View style={styles.container}>
      {/* Dynamic Header */}
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
        ]}
      >
        <View style={styles.headerLeft}>
          {isDesktop ? (
            <Feather color={colors.primaryDark} name="user" size={24} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.headerAvatarImage} />
              ) : (
                <Feather color={colors.primary} name="user" size={28} />
              )}
            </View>
          )}

          <View style={styles.headerInfo}>
            <Text style={styles.pageTitle}>Profile</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions
              fullName={dashboardQuery.data?.fullName || userName}
              alertCount={dashboardQuery.data?.alerts?.length || 0}
              onBellPress={() => { }}
            />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.scrollContent}>
        <View style={[styles.contentBody, !isDesktop && styles.contentBodyMobile]}>

          {/* USER PROFILE CARD */}
          <Card style={styles.customCard}>
            <View style={styles.heroBox}>
              <View style={styles.userProfileLeft}>
                <View style={styles.heroAvatarContainer}>
                  <View style={styles.heroAvatar}>
                    {profileImageUri ? (
                      <Image source={{ uri: profileImageUri }} style={styles.heroAvatarImage} />
                    ) : (
                      <Feather color={colors.primary} name="user" size={22} />
                    )}
                    {isUploadingImage && (
                      <View style={styles.avatarLoadingOverlay}>
                        <ActivityIndicator color={colors.primary} size="small" />
                      </View>
                    )}
                  </View>
                </View>
                <View>
                  <Text style={styles.heroTitle}>{userName}</Text>
                  <Text style={styles.heroSubtitle}>Registered User Profile</Text>
                </View>
              </View>

            </View>

            {/* DOCKET SELECTION UI */}
            {casesList.length > 0 && (
              <View style={{ marginTop: spacing.md }}>
                <View style={[styles.docketSelectorHeader, !isDesktop && styles.docketSelectorHeaderMobile]}>
                  <View style={styles.docketSelectorLeft}>
                    <View style={styles.blueIconBox}>
                      <Feather color={colors.primary} name="archive" size={18} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docketSelectorTitle}>Your Dockets</Text>
                      <Text style={styles.docketSelectorSubtitle}>Select a docket to view case details and preferences.</Text>
                    </View>
                  </View>

                  {/* Docket Buttons */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.docketsList}>
                    {casesList.map((item, idx) => {
                      const isSelected = (item.userId && item.userId === selectedCase?.userId) || (!item.userId && idx === 0 && !selectedCase?.userId);
                      const rawDocketId = item.docketNumber || item.docketId || item.docketNo || item.caseNumber || `${idx + 1}`;
                      const docketNum = String(rawDocketId).replace(/^Docket\s*/i, '');

                      return (
                        <Pressable
                          key={item.userId || idx}
                          onPress={() => handleSelectDocket(item)}
                          style={[styles.docketPill, isSelected ? styles.docketPillActive : styles.docketPillInactive]}
                        >
                          <Text style={[styles.docketPillTitle, isSelected && styles.textWhite]}>
                            {docketNum}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Active Docket Details Grid */}
                {selectedCase && (
                  <View style={[styles.docketDetailGrid, !isDesktop && styles.docketDetailGridMobile]}>
                    <View style={styles.docketGridCol}>
                      <View style={styles.docketTextWrap}>
                        <Text style={styles.fieldLabel}>Docket ID</Text>
                        <Text style={styles.fieldValueBold}>
                          {selectedCase.docketNumber || selectedCase.docketId || selectedCase.docketNo || selectedCase.caseNumber || 'N/A'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.gridDivider} />

                    <View style={styles.docketGridCol}>
                      <View style={styles.docketTextWrap}>
                        <Text style={styles.fieldLabel}>Case Type</Text>
                        <Text style={styles.fieldValueBold} numberOfLines={1}>
                          {selectedCase.caseType || selectedCase.type || 'N/A'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.gridDivider} />

                    <View style={styles.docketGridCol}>
                      <View style={styles.docketTextWrap}>
                        <Text style={styles.fieldLabel}>Case Stage</Text>
                        <Text style={styles.fieldValueBold} numberOfLines={1}>
                          {selectedCase.caseStage || selectedCase.stage || 'N/A'}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}
          </Card>

          {/* PREFERENCES */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>PREFERENCES</Text>
            <View style={styles.blueBar} />
          </View>

          <Card style={styles.customCard}>
            <View style={[styles.preferenceRow, !isDesktop && styles.preferenceRowMobile]}>
              <View style={[styles.prefLeft, !isDesktop && styles.prefLeftMobile]}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.primary} name="globe" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefTitle}>Display Language</Text>
                  <Text style={styles.prefSubtitle}>Select your preferred interface language</Text>
                </View>
              </View>

              <View style={[styles.dropdownContainer, !isDesktop && styles.dropdownContainerMobile]}>
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
                  options={languageOptions}
                  value={currentDisplayLanguageId}
                  placeholder="Select interface language"
                  disabled={updateLanguage.isPending || languagesQuery.isLoading}
                />
              </View>
            </View>

            <View style={styles.rowDivider} />

            <View style={[styles.preferenceRow, !isDesktop && styles.preferenceRowMobile]}>
              <View style={[styles.prefLeft, !isDesktop && styles.prefLeftMobile]}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.primary} name="mic" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefTitle}>Speaking Language</Text>
                  <Text style={styles.prefSubtitle}>Language used for voice check-ins and AI calls</Text>
                </View>
              </View>

              <View style={[styles.dropdownContainer, !isDesktop && styles.dropdownContainerMobile]}>
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
            <View style={styles.blueBar} />
          </View>

          <Card style={styles.customCard}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <Text style={styles.prefTitle}>Prefer a human counsellor</Text>
                <Text style={styles.prefSubtitle}>Get matched with a counsellor for chat & calls</Text>
              </View>
              <Switch
                disabled={updateCounsellorPreference.isPending}
                onValueChange={handleToggleCounsellorPreference}
                thumbColor="#F4F3F4"
                activeThumbColor="#F4F3F4"
                trackColor={{ false: colors.border, true: colors.primary }}
                value={localOptedForCounsellor}
              />
            </View>
          </Card>

          {/* SYSTEM */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>SYSTEM</Text>
            <View style={styles.blueBar} />
          </View>

          <Card style={styles.customCard}>
            <View style={[styles.systemRow, !isDesktop && styles.systemRowMobile]}>
              <View style={[styles.prefLeft, !isDesktop && styles.prefLeftMobile]}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.primary} name="bell" size={18} />
                </View>
                <Text style={styles.prefTitle}>Push Notifications</Text>
              </View>
              <Text style={[styles.systemValueText, !isDesktop && styles.systemValueTextMobile]}>Enabled</Text>
            </View>

            <View style={styles.rowDivider} />

            <View style={[styles.systemRow, !isDesktop && styles.systemRowMobile]}>
              <View style={[styles.prefLeft, !isDesktop && styles.prefLeftMobile]}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.textSecondary} name="info" size={18} />
                </View>
                <Text style={styles.prefTitle}>App Version</Text>
              </View>
              <Text style={[styles.systemValueText, !isDesktop && styles.systemValueTextMobile]}>v2.4.0 (Mansakha Official)</Text>
            </View>
          </Card>

          {/* SECURITY */}
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>SECURITY</Text>
            <View style={styles.blueBar} />
          </View>

          <Card style={styles.customCard}>
            <View style={[styles.preferenceRow, !isDesktop && styles.preferenceRowMobile]}>
              <View style={[styles.prefLeft, !isDesktop && styles.prefLeftMobile]}>
                <View style={styles.prefIconBox}>
                  <Feather color={colors.primary} name="lock" size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prefTitle}>Password</Text>
                  <Text style={styles.prefSubtitle}>Change the password used to sign in</Text>
                </View>
              </View>

              <Pressable
                onPress={() => setShowPasswordForm((v) => !v)}
                style={[styles.outlineBtn, !isDesktop && styles.outlineBtnMobile]}
              >
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
            <View style={styles.blueBar} />
          </View>
          <LogoutButton style={{ marginBottom: spacing.lg }} variant="row" />
        </View>
      </ScrollView>

      {!isDesktop && <BottomNavBar currentTab="Profile" navigation={navigation} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA'
  },
  scrollContent: {
    flex: 1
  },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  headerInfo: {
    flex: 1
  },
  pageTitle: {
    ...typography.h1,
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: '700',
  },
  headerRight: {
    marginLeft: spacing.md
  },
  contentBody: {
    backgroundColor: '#F3F6FA',
    paddingHorizontal: 36,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    width: '100%',
  },
  contentBodyMobile: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
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

  /* Custom Card */
  customCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...shadow.sm,
  },

  /* Profile Hero Banner */
  heroBox: {
    backgroundColor: '#F0EAFB',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userProfileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  heroAvatarContainer: {
    position: 'relative',
    marginRight: spacing.sm,
  },
  heroAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroAvatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    ...typography.bodyStrong,
    color: '#4A3070',
    fontSize: 18,
    fontWeight: '700',
  },
  heroSubtitle: {
    ...typography.caption,
    color: '#718096',
    marginTop: 1,
  },
  badgeCheckCircle: {
    backgroundColor: '#7C5CBF',
    borderRadius: radius.pill,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Docket Selector Section */
  docketSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  docketSelectorHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  docketSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 200,
  },
  blueIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: '#F0EAFB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  docketSelectorTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  docketSelectorSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  docketsList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
  },
  docketPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  docketPillActive: {
    backgroundColor: '#4A3070',
    borderColor: '#4A3070',
  },
  docketPillInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  docketPillTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  textWhite: {
    color: colors.white,
  },

  /* Active Docket Detail Grid */
  docketDetailGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#F0EAFB',
  },
  docketDetailGridMobile: {
    paddingHorizontal: spacing.xs,
  },
  docketGridCol: {
    flex: 1,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  docketTextWrap: {
    flexDirection: 'column',
  },
  gridDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 2,
  },
  fieldLabel: {
    ...typography.caption,
    color: '#8A99AD',
    fontSize: 11,
    marginBottom: 2,
  },
  fieldValueBold: {
    ...typography.bodyStrong,
    color: '#4A3070',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Preference Rows Layout */
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  preferenceRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  prefLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.xs,
  },
  prefLeftMobile: {
    flex: undefined,
    marginRight: 0,
  },
  prefIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: '#F0EAFB',
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
  dropdownContainerMobile: {
    width: '100%',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: spacing.sm,
  },

  /* System Cards */
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  systemRowMobile: {
    alignItems: 'flex-start',
  },
  systemValueText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  systemValueTextMobile: {
    flex: 1,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: spacing.sm,
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
  outlineBtnMobile: {
    alignSelf: 'flex-start',
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