import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import Card from '../../shared/components/Card';
import Button from '../../shared/components/Button';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary, EmptyState } from '../../shared/components/QueryStates';
import { useUserDashboard, useRehabilitationEligibility, useOptInRehabilitation } from '../../shared/services/hooks';
import { useActiveCase } from '../../shared/context/ActiveCaseContext';

// Pill styling per provider type - Government leans on the same
// success-green used elsewhere for a "settled/official" status, NGO on the
// app's own primary accent, matching RequestInterventionScreen.js's/
// RehabilitationProgressScreen.js's STATUS_META convention of a
// {color, bg} pair per category.
const PROVIDER_TYPE_META = {
  Government: { color: colors.success, bg: colors.successLight },
  NGO: { color: colors.primary, bg: colors.primaryLight },
};

function ProviderCard({ provider, onChoose, choosing }) {
  const meta = PROVIDER_TYPE_META[provider.providerType] || PROVIDER_TYPE_META.NGO;
  return (
    <Card>
      <View style={styles.providerTopRow}>
        <Text style={styles.providerName}>{provider.name}</Text>
        <View style={[styles.typePill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.typePillText, { color: meta.color }]}>{provider.providerType}</Text>
        </View>
      </View>
      {!!provider.contactInfo && <Text style={styles.providerCaption}>{provider.contactInfo}</Text>}
      <Button
        title="Choose this provider"
        onPress={() => onChoose(provider.providerId)}
        loading={choosing}
        disabled={choosing}
        style={{ marginTop: spacing.md }}
      />
    </Card>
  );
}

// All / Government / NGO - a real filter over the provider list rather than
// a flat scroll, so a victim can find the kind of centre they actually want
// (a government hospital-run programme vs. an NGO) without reading every
// card. Exported alongside EligibleContent so the mandatory decision gate
// (RehabilitationDecisionGate.js) can reuse the exact same component -
// there is only ever one implementation of "pick a provider" in this app.
const PROVIDER_TYPE_FILTERS = ['All', 'Government', 'NGO'];

function ProviderTypeToggle({ value, onChange }) {
  return (
    <View style={styles.toggleRow}>
      {PROVIDER_TYPE_FILTERS.map((f) => {
        const active = value === f;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            style={[styles.toggleSegment, active && styles.toggleSegmentActive]}
          >
            <Text style={[styles.toggleSegmentText, active && styles.toggleSegmentTextActive]}>{f}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// onOptedIn: called after a successful opt-in, instead of this component
// deciding navigation itself - the standalone screen below passes a
// navigation-based redirect; the mandatory gate passes nothing, since
// opting in only records rehabilitation_opted_in_at against the specific
// docket (migration_034 - case_stage itself stays exclusively eCourt's) and
// the gate's own eligibility query (invalidated by useOptInRehabilitation
// already) naturally stops showing this screen on its very next render.
// caseUserId: which docket in the caller's own family this decision is
// FOR - required whenever this isn't the caller's own anchor case (e.g. the
// mandatory Rehabilitation gate acting on a different family member's
// Rehabilitation-stage docket).
export function EligibleContent({ providers, onOptedIn, caseUserId }) {
  const optIn = useOptInRehabilitation(caseUserId);
  const [chosenProviderId, setChosenProviderId] = useState(null);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('All');

  const handleChoose = async (providerId) => {
    setError(null);
    setChosenProviderId(providerId);
    try {
      await optIn.mutateAsync(providerId);
      onOptedIn?.();
    } catch (err) {
      setError(err.message || 'Could not opt in to rehabilitation.');
    } finally {
      setChosenProviderId(null);
    }
  };

  const visibleProviders = typeFilter === 'All' ? providers : providers.filter((p) => p.providerType === typeFilter);

  return (
    <>
      <Text style={styles.introText}>
        Your case has been closed. Choose a rehabilitation provider below to begin livelihood, housing and
        schooling support tracked by a Rehabilitation Officer.
      </Text>

      <ProviderTypeToggle value={typeFilter} onChange={setTypeFilter} />

      {error && <Text style={styles.errorText}>{error}</Text>}

      {visibleProviders.length === 0 ? (
        <EmptyState icon="filter" title="No centres of this type" message="Kindly try a different filter." />
      ) : (
        visibleProviders.map((p) => (
          <ProviderCard
            key={p.providerId}
            provider={p}
            onChoose={handleChoose}
            choosing={optIn.isPending && chosenProviderId === p.providerId}
          />
        ))
      )}
    </>
  );
}

export default function RehabilitationOptInScreen({ navigation, route }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  // Optional - which docket in the caller's own family this screen concerns.
  // An explicit route param (a direct deep-link) wins; otherwise this falls
  // back to whichever docket is active in Settings/Profile (see
  // ActiveCaseContext.js), and finally to the caller's own anchor case when
  // neither is set, same as every other hook here defaults when caseUserId
  // is omitted. Note: this is this SCREEN's own resolution only -
  // EligibleContent below is also rendered directly by
  // RehabilitationDecisionGate.js with its own explicit caseUserId prop,
  // which must never be overridden by context (a pending decision gate is
  // about one specific case, not "whatever's currently active").
  const { activeCaseUserId } = useActiveCase();
  const caseUserId = route?.params?.caseUserId || activeCaseUserId;
  const dashboardQuery = useUserDashboard(caseUserId);
  const eligibilityQuery = useRehabilitationEligibility(caseUserId);

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
            <Feather name="compass" size={22} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Rehabilitation Support</Text>
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
          <QueryBoundary query={eligibilityQuery}>
            {(data) => {
              if (!data?.eligible) {
                return (
                  <EmptyState
                    icon="clock"
                    title="Not available yet"
                    message={data?.reason || 'Rehabilitation becomes available once your case reaches the Rehabilitation stage.'}
                  />
                );
              }

              return (
                <EligibleContent
                  providers={data.providers || []}
                  caseUserId={caseUserId}
                  onOptedIn={() => {
                    if (navigation?.canGoBack?.()) {
                      navigation.goBack();
                    } else {
                      navigation?.navigate('RehabilitationProgress');
                    }
                  }}
                />
              );
            }}
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

  introText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },

  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleSegment: { flex: 1, paddingVertical: spacing.xs, borderRadius: radius.pill, alignItems: 'center' },
  toggleSegmentActive: { backgroundColor: colors.primary },
  toggleSegmentText: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  toggleSegmentTextActive: { color: colors.onPrimary },

  providerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  providerName: { ...typography.bodyStrong, color: colors.textPrimary, fontSize: 15, flex: 1, marginRight: spacing.sm },
  typePill: { paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  typePillText: { ...typography.caption, fontWeight: '700', fontSize: 10 },
  providerCaption: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },

  errorText: { ...typography.bodySmall, color: colors.danger, marginBottom: spacing.md },
});
