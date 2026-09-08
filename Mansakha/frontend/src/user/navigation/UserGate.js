import React, { useEffect } from 'react';
import { useConsentStatus, useRehabilitationEligibility, useDeclineRehabilitation } from '../shared/services/hooks';
import { useAuth } from '../shared/context/AuthContext';
import { LoadingState, ErrorState } from '../shared/components/QueryStates';
import ConsentScreen from '../auth/screens/ConsentScreen';
import RehabilitationDecisionGate from './RehabilitationDecisionGate';
import UserShell from './UserShell';

// Consent is shown once, before Home - Screen Inventory (Section 8). Gated here
// rather than inside UserShell so the tab bar/bottom-nav never renders until
// consent is actually recorded.
//
// The rehabilitation decision gate is checked right after consent, same
// place - once a case is closed and no decision has been made yet
// (useRehabilitationEligibility().eligible === true), the victim is forced
// to answer before UserShell ever mounts, rather than discovering an
// optional Home tile. No separate "already asked" state is needed: opting
// in flips case_stage away from 'Case Closed' and declining deactivates the
// account outright (logged out immediately) - `eligible` alone naturally
// becomes false either way on the very next check.
export default function UserGate() {
  const query = useConsentStatus();
  const { logout } = useAuth();
  const hasConsented = !!query.data?.hasConsented;
  const eligibilityQuery = useRehabilitationEligibility();
  const decline = useDeclineRehabilitation();

  // A 401 here means the stored session is dead (expired/invalid token) -
  // "Retry" would just fail the same way forever, so log out instead and
  // let RootNavigator send the user back to the login flow.
  useEffect(() => {
    if (query.error?.status === 401) logout();
  }, [query.error]);

  if (query.isLoading) return <LoadingState />;
  if (query.error?.status === 401) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error?.message} onRetry={query.refetch} />;
  if (!hasConsented) return <ConsentScreen onConsented={() => query.refetch()} />;

  // Checked only once consent is settled - no reason to force a rehabilitation
  // decision before consent itself is even recorded. Loading state here
  // reuses the same LoadingState as the consent check above, matching this
  // gate's own established pattern of never rendering UserShell prematurely.
  if (eligibilityQuery.isLoading) return <LoadingState />;
  if (eligibilityQuery.data?.eligible) {
    return (
      <RehabilitationDecisionGate
        providers={eligibilityQuery.data.providers || []}
        onDeclined={() => decline.mutateAsync()}
      />
    );
  }

  return <UserShell />;
}
