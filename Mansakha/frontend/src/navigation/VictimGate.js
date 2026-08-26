import React, { useEffect } from 'react';
import { useConsentStatus } from '../services/hooks';
import { useAuth } from '../context/AuthContext';
import { LoadingState, ErrorState } from '../components/QueryStates';
import ConsentScreen from '../screens/victim/ConsentScreen';
import VictimShell from './VictimShell';

// Consent is shown once, before Home - Screen Inventory (Section 8). Gated here
// rather than inside VictimShell so the tab bar/bottom-nav never renders until
// consent is actually recorded.
export default function VictimGate() {
  const query = useConsentStatus();
  const { logout } = useAuth();

  // A 401 here means the stored session is dead (expired/invalid token) -
  // "Retry" would just fail the same way forever, so log out instead and
  // let RootNavigator send the user back to the login flow.
  useEffect(() => {
    if (query.error?.status === 401) logout();
  }, [query.error]);

  if (query.isLoading) return <LoadingState />;
  if (query.error?.status === 401) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error?.message} onRetry={query.refetch} />;
  if (!query.data?.hasConsented) return <ConsentScreen onConsented={() => query.refetch()} />;
  return <VictimShell />;
}
