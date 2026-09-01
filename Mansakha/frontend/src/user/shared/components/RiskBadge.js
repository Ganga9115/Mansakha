import React from 'react';
import StatusBadge from './StatusBadge';

// Thin compatibility wrapper - the actual flat/bordered/tinted rendering
// now lives in StatusBadge.js (broader than risk levels, also covers
// alert/account/load status), kept so existing call sites don't all need
// touching in the same pass.
export default function RiskBadge({ riskLevel }) {
  return <StatusBadge status={riskLevel} />;
}
