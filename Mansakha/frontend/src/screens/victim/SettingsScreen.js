import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  useVictimDashboard,
  useConsentStatus,
  useLanguageOptions,
  useUpdateVictimLanguage,
} from '../../services/hooks';
import { apiClient } from '../../services/apiClient';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import { formContentWidth } from '../../theme/layout';
import { useResponsive } from '../../hooks/useResponsive';
import Card from '../../components/Card';
import Dropdown from '../../components/Dropdown';
import IconInput from '../../components/IconInput';
import DesktopHeaderActions from '../../components/DesktopHeaderActions';
import { Skeleton } from '../../components/Skeleton';

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

export default function SettingsScreen() {
  const { logout, session } = useAuth();
  const toast = useToast();
  const dashboardQuery = useVictimDashboard();
  const consentQuery = useConsentStatus();
  const languagesQuery = useLanguageOptions();
  const updateLanguage = useUpdateVictimLanguage();
  const [languageId, setLanguageId] = useState(null);
  const { tier, isDesktop } = useResponsive();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const today = new Date();
  const dayStr = `Day - ${String(today.getDate()).padStart(2, '0')}`;
  const monthStr = `Month - ${today.toLocaleString('default', { month: 'long' })}`;
  const yearStr = `Year - ${today.getFullYear()}`;

  const languageOptions = (languagesQuery.data?.languages || []).map((l) => ({
    value: l.language_id,
    label: l.name,
  }));
  const currentLanguageId = languageId ?? dashboardQuery.data?.preferredLanguageId ?? '';

  const handleLanguageChange = async (value) => {
    setLanguageId(value);
    try {
      await updateLanguage.mutateAsync(value);
      toast.success('Preferred language updated.');
    } catch (err) {
      toast.error(err.message);
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
      await apiClient.post('/api/auth/victim/change-password', { newPassword }, session?.token);
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setShowPasswordForm(false); setPasswordSuccess(false); }, 1500);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      {/* Blue Header Section */}
      <View style={[styles.topHeader, isDesktop && styles.topHeaderDesktop]}>
        <View style={styles.headerLeft}>
          {isDesktop ? (
            <Feather name="settings" size={20} color={colors.primaryDark} style={styles.headerIconDesktop} />
          ) : (
            <View style={styles.avatarContainer}>
              <Feather name="settings" size={28} color={colors.primary} />
              <View style={styles.avatarEditBadge}>
                <Feather name="sliders" size={10} color={colors.white} />
              </View>
            </View>
          )}

          <View style={styles.headerInfo}>
            {!isDesktop && (
              <View style={styles.pillBadge}>
                <Text style={styles.pillText}>PREFERENCES</Text>
              </View>
            )}
            <Text style={styles.statusTitle}>App Settings</Text>
            {!isDesktop && <Text style={styles.subtext}>Manage account & choices</Text>}
          </View>
        </View>

        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions
              fullName={dashboardQuery.data?.fullName}
              alertCount={dashboardQuery.data?.alerts?.length || 0}
              onBellPress={() => {}}
            />
          ) : (
            <Pressable style={styles.iconCircleBtn} onPress={logout}>
              <Feather name="log-out" size={18} color={colors.error} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Main Rounded Body Area */}
      <View style={[styles.contentBody, isDesktop && styles.contentBodyDesktop, { maxWidth: formContentWidth[tier], width: '100%', alignSelf: 'center' }]}>
        {/* Date Ticker Bar */}
        <View style={styles.dateTicker}>
          <Text style={styles.tickerText}>{dayStr}</Text>
          <Text style={[styles.tickerText, styles.tickerTextActive]}>{monthStr}</Text>
          <Text style={styles.tickerText}>{yearStr}</Text>
        </View>

        {/* Account Details Card */}
        <Text style={styles.sectionHeaderTitle}>ACCOUNT OVERVIEW</Text>
        <Card style={styles.customCard}>
          <View style={styles.cardHeader}>
            <View style={styles.accountIconTile}>
              <Feather name="user-check" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardHeaderTitle}>
                {session?.accountType === 'victim' ? 'Victim Account' : session?.accountType || 'User'}
              </Text>
              <Text style={styles.cardHeaderSubtitle}>Registered User Profile</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <InfoTileRow
            icon="briefcase"
            label="Case Status"
            loading={dashboardQuery.isLoading}
            value={
              dashboardQuery.data
                ? `${dashboardQuery.data.caseStatus.status} • ${dashboardQuery.data.caseStatus.caseStage}`
                : '-'
            }
          />
          <InfoTileRow
            icon="shield-check"
            label="Mobile Consent"
            loading={consentQuery.isLoading}
            value={consentQuery.data?.hasConsented ? 'Consent Granted' : 'Pending Consent'}
            iconColor={consentQuery.data?.hasConsented ? colors.success : colors.warning}
          />
          <InfoTileRow
            icon="lock"
            label="Security Status"
            value="Encrypted End-to-End"
            iconColor={colors.info}
            isLast
          />
        </Card>

        {/* Preferences Section */}
        <Text style={styles.sectionHeaderTitle}>PREFERENCES</Text>
        <Card style={styles.customCard}>
          <View style={styles.cardHeader}>
            <View style={styles.accountIconTile}>
              <Feather name="globe" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardHeaderTitle}>Language</Text>
              <Text style={styles.cardHeaderSubtitle}>Select your preferred interface language</Text>
            </View>
          </View>

          <View style={{ marginTop: spacing.md }}>
            <Dropdown
              options={languageOptions}
              value={currentLanguageId}
              onChange={handleLanguageChange}
              placeholder="Select a language"
              disabled={updateLanguage.isPending}
            />
          </View>
        </Card>

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
              />
              <IconInput
                icon="lock"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  statusTitle: { ...typography.h3, color: colors.primaryDark },
  subtext: { ...typography.caption, color: colors.textSecondary },
  headerRight: { marginLeft: spacing.md },
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
  dateTicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  tickerText: { ...typography.bodyStrong, color: colors.primary },
  tickerTextActive: { color: colors.error },
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
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  outlineBtnText: { ...typography.bodyStrong, color: colors.textPrimary },
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