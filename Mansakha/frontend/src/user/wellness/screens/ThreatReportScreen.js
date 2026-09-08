import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
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
import { useUserDashboard, useThreatStatus, useReportThreat } from '../../shared/services/hooks';

// Threat - the consolidated Protection Officer flow. Location capture is
// best-effort only: a denied permission, an unsupported platform (desktop
// web has no GPS), or any failure never blocks the report itself - naming
// the threat matters more than pinpointing it, and the backend already
// treats location as optional.
async function captureLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({});
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

function ReportForm() {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const reportThreat = useReportThreat();

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setError(null);
    try {
      const location = await captureLocation();
      await reportThreat.mutateAsync({ reason: reason.trim(), location });
    } catch (err) {
      setError(err.message || 'Could not submit your report.');
    }
  };

  return (
    <Card>
      <View style={styles.alertIconRow}>
        <Feather name="alert-triangle" size={20} color={colors.danger} />
        <Text style={styles.cardTitle}>Report a Threat</Text>
      </View>
      <Text style={styles.introText}>
        Kindly describe the threat you are facing. Your report is sent immediately to the Protection
        Officer assigned to your district, along with your location if permitted.
      </Text>
      <TextInput
        style={styles.textArea}
        multiline
        numberOfLines={4}
        placeholder="e.g. I was followed and threatened near my home today..."
        placeholderTextColor={colors.textSecondary}
        value={reason}
        onChangeText={setReason}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Button title="Submit Report" onPress={handleSubmit} loading={reportThreat.isPending} disabled={!reason.trim() || reportThreat.isPending} />
    </Card>
  );
}

function StatusCard({ data }) {
  return (
    <>
      <Card>
        <View style={styles.statusHeaderRow}>
          <Text style={styles.cardTitle}>Your Protection Status</Text>
          <View style={[styles.statusPill, data.status === 'Resolved' ? styles.statusPillResolved : styles.statusPillOpen]}>
            <Text style={[styles.statusPillText, data.status === 'Resolved' ? styles.statusPillTextResolved : styles.statusPillTextOpen]}>
              {data.status === 'Resolved' ? 'Resolved' : 'Active'}
            </Text>
          </View>
        </View>
        <Text style={styles.pendingText}>
          {data.updates.length === 0
            ? 'Your report has been received. The assigned Protection Officer will act on it shortly.'
            : 'Latest updates from your assigned Protection Officer:'}
        </Text>
      </Card>

      {data.updates.map((u, idx) => (
        <View key={idx} style={styles.updateRow}>
          <Feather name="shield" size={14} color={colors.success} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.updateText}>{u.noteText}</Text>
            <Text style={styles.updateDate}>{new Date(u.createdAt).toLocaleString('en-IN')}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

export default function ThreatReportScreen({ navigation }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const statusQuery = useThreatStatus();

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
            <Feather name="shield" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Protection</Text>
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
            {(data) => (data?.hasReport ? <StatusCard data={data} /> : <ReportForm />)}
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

  alertIconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15 },
  introText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 },
  textArea: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md,
    minHeight: 90, textAlignVertical: 'top', color: colors.textPrimary, marginBottom: spacing.md, ...typography.bodySmall,
  },
  errorText: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.md },

  statusHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  statusPill: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  statusPillOpen: { backgroundColor: colors.warningLight },
  statusPillResolved: { backgroundColor: colors.successLight },
  statusPillText: { ...typography.caption, fontWeight: '700' },
  statusPillTextOpen: { color: colors.warning },
  statusPillTextResolved: { color: colors.success },
  pendingText: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 20 },

  updateRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  updateText: { ...typography.bodySmall, color: colors.textPrimary, lineHeight: 19 },
  updateDate: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
});
