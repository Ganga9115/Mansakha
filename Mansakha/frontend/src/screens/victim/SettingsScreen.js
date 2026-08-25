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
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { shadow } from '../../theme/shadow';
import Card from '../../components/Card';
import Dropdown from '../../components/Dropdown';
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

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      {/* Blue Header Section */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarContainer}>
            <Feather name="settings" size={28} color={colors.primary} />
            <View style={styles.avatarEditBadge}>
              <Feather name="sliders" size={10} color={colors.white} />
            </View>
          </View>

          <View style={styles.headerInfo}>
            <View style={styles.pillBadge}>
              <Text style={styles.pillText}>PREFERENCES</Text>
            </View>
            <Text style={styles.statusTitle}>App Settings</Text>
            <Text style={styles.subtext}>Manage account & choices</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Pressable style={styles.iconCircleBtn} onPress={logout}>
            <Feather name="log-out" size={18} color={colors.error} />
          </Pressable>
        </View>
      </View>

      {/* Main Rounded Body Area */}
      <View style={styles.contentBody}>
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

        {/* Log Out Action Button */}
        <Pressable style={styles.logoutBtn} onPress={logout}>
          <Feather name="log-out" size={18} color={colors.error} style={{ marginRight: spacing.xs }} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
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
  logoutBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.error,
  },
  logoutText: { ...typography.bodyStrong, color: colors.error, fontSize: 16 },
});