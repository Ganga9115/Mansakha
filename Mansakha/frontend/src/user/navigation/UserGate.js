import React, { useEffect } from 'react';
import { useConsentStatus, useUserDashboard, useRehabilitationEligibility } from '../shared/services/hooks';
import { useAuth } from '../shared/context/AuthContext';
import { LoadingState, ErrorState } from '../shared/components/QueryStates';
import ConsentScreen from '../auth/screens/ConsentScreen';
import RehabilitationDecisionGate from './RehabilitationDecisionGate';
import RehabilitationClosureGate from './RehabilitationClosureGate';
import UserShell from './UserShell';

// Consent is shown once, before Home - Screen Inventory (Section 8). Gated here
// rather than inside UserShell so the tab bar/bottom-nav never renders until
// consent is actually recorded.
//
// migration_034 - case-lifecycle/rehabilitation gating: checked right after
// consent, across EVERY case in the victim's own family (not just their
// anchor docket - a person can have several cases in different eCourt
// stages at once), in this strict priority order:
//   1. Any case with a pending post-closure Rehabilitation continuation
//      decision (rehabilitationClosurePendingAck) - the special flow takes
//      priority over everything else, since it can only ever apply to a
//      case that was already isolated into Rehabilitation.
//   2. Any case currently in the Rehabilitation stage that hasn't been
//      answered yet (not opted in, not declined) - the mandatory decision
//      gate.
//   3. Otherwise, UserShell renders normally. Investigation/Trial/
//      Compensation/Case Closed cases (and any Rehabilitation-stage case
//      the victim already answered either way) never force a gate here -
//      they continue on the existing, non-isolated shared login/context.
// No separate "already asked" state is needed beyond the family's own
// flags: each mutation below invalidates the dashboard query this gate
// itself reads, so the very next render naturally reflects the answer.
export default function UserGate() {
  const query = useConsentStatus();
  const { logout } = useAuth();
  const hasConsented = !!query.data?.hasConsented;

  // Family-wide view (no caseUserId - defaults to the anchor, whose
  // linkedCases already covers every docket in the family) purely to
  // resolve gating; UserShell/HomeScreen do their own case-specific fetch
  // for the actual dashboard content once past this gate.
  const dashboardQuery = useUserDashboard();
  const linkedCases = dashboardQuery.data?.linkedCases || [];
  const pendingClosureCase = linkedCases.find((c) => c.rehabilitationClosurePendingAck);
  const pendingDecisionCase = linkedCases.find(
    (c) => c.caseStage === 'Rehabilitation' && !c.rehabilitationOptedIn && !c.rehabilitationDeclined
  );

  // The decision gate needs the provider list for whichever case is
  // pending, which useUserDashboard doesn't carry - fetched only when a
  // pending case actually exists (react-query's `enabled` keeps this from
  // firing needlessly on every render for accounts with nothing pending).
  const eligibilityQuery = useRehabilitationEligibility(pendingDecisionCase?.userId);

  // A 401 here means the stored session is dead (expired/invalid token) -
  // "Retry" would just fail the same way forever, so log out instead and
  // let RootNavigator send the user back to the login flow.
  useEffect(() => {
    if (query.error?.status === 401 || dashboardQuery.error?.status === 401) logout();
  }, [query.error, dashboardQuery.error]);

  if (query.isLoading) return <LoadingState />;
  if (query.error?.status === 401) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error?.message} onRetry={query.refetch} />;
  if (!hasConsented) return <ConsentScreen onConsented={() => query.refetch()} />;

  // Checked only once consent is settled - no reason to force a
  // rehabilitation-related decision before consent itself is even recorded.
  if (dashboardQuery.isLoading) return <LoadingState />;
  if (dashboardQuery.error?.status === 401) return <LoadingState />;
  if (dashboardQuery.isError) return <ErrorState message={dashboardQuery.error?.message} onRetry={dashboardQuery.refetch} />;

  if (pendingClosureCase) {
    return (
      <RehabilitationClosureGate
        docketNumber={pendingClosureCase.docketNumber}
        caseUserId={pendingClosureCase.userId}
        onAnswered={() => dashboardQuery.refetch()}
      />
    );
  }

  if (pendingDecisionCase) {
    if (eligibilityQuery.isLoading) return <LoadingState />;
    return (
      <RehabilitationDecisionGate
        providers={eligibilityQuery.data?.providers || []}
        caseUserId={pendingDecisionCase.userId}
        docketNumber={pendingDecisionCase.docketNumber}
        onDeclined={() => dashboardQuery.refetch()}
      />
    );
  }

  return <UserShell />;
}
