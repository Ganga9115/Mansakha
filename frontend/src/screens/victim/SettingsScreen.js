import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { typography } from '../../theme/typography';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVictimDashboard, useConsentStatus, useLanguageOptions, useUpdateVictimLanguage } from '../../services/hooks';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Dropdown from '../../components/Dropdown';
import { Skeleton } from '../../components/Skeleton';

// The profile section below only surfaces what useVictimDashboard/
// useConsentStatus/useAuth actually return - there's no name/email/phone
// available anywhere in the victim session or dashboard payload to show, so
// this stays limited to account type, case status, and consent state.
function InfoRow({ icon, label, value, loading }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconTile}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        {loading ? <Skeleton width={120} height={14} /> : <Text style={styles.infoValue}>{value}</Text>}
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

  const languageOptions = (languagesQuery.data?.languages || []).map((l) => ({ value: l.language_id, label: l.name }));
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
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <Card elevated>
        <View style={styles.cardHeader}>
          <View style={styles.avatarTile}>
            <Feather name="user" size={22} color={colors.onPrimary} />
          </View>
          <View>
            <Text style={styles.cardHeaderTitle}>Your account</Text>
            <Text style={styles.cardHeaderSubtitle}>{session?.accountType === 'victim' ? 'Victim account' : session?.accountType}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <InfoRow
          icon="briefcase"
          label="Case status"
          loading={dashboardQuery.isLoading}
          value={dashboardQuery.data ? `${dashboardQuery.data.caseStatus.status} - ${dashboardQuery.data.caseStatus.caseStage}` : '-'}
        />
        <InfoRow
          icon="shield"
          label="Consent (Mobile App)"
          loading={consentQuery.isLoading}
          value={consentQuery.data?.hasConsented ? 'Given' : 'Not given'}
        />
      </Card>

      <Card elevated>
        <Text style={styles.cardHeaderTitle}>Preferred language</Text>
        <Dropdown
          options={languageOptions}
          value={currentLanguageId}
          onChange={handleLanguageChange}
          placeholder="Select a language"
          disabled={updateLanguage.isPending}
        />
      </Card>

      <Button title="Log out" variant="danger" icon="log-out" onPress={logout} style={styles.logoutButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.lg },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatarTile: {
    width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  cardHeaderTitle: { ...typography.h3, color: colors.textPrimary },
  cardHeaderSubtitle: { ...typography.bodySmall, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  infoIconTile: {
    width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  infoTextWrap: { flex: 1 },
  infoLabel: { ...typography.label, color: colors.textSecondary },
  infoValue: { ...typography.body, color: colors.textPrimary, marginTop: 2 },
  logoutButton: { marginTop: spacing.xl },
});
