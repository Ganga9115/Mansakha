import React from 'react';
import { useConsentStatus } from '../services/hooks';
import { LoadingState, ErrorState } from '../components/QueryStates';
import ConsentScreen from '../screens/victim/ConsentScreen';
import VictimShell from './VictimShell';

// Consent is shown once, before Home - Screen Inventory (Section 8). Gated here
// rather than inside VictimShell so the tab bar/bottom-nav never renders until
// consent is actually recorded.
export default function VictimGate() {
  const query = useConsentStatus();

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error?.message} onRetry={query.refetch} />;
  if (!query.data.hasConsented) return <ConsentScreen onConsented={() => query.refetch()} />;
  return <VictimShell />;
}
