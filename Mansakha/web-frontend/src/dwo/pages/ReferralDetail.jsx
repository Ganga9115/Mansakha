import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import ReferralHeader from '../components/ReferralHeader';
import ReferralSubNav from '../components/ReferralSubNav';
import { HeartHandshake } from 'lucide-react';
import { useReferralDetail, useResolveReferral, useHandOffRehabilitation, useRehabilitationProviders } from '../services/hooks';

// District Welfare Officer's Referral Overview - just the case context and
// the Forward-to-Rehabilitation action. Immediate Relief and Compensation
// each moved to their own dedicated page (ReferralRelief.jsx,
// ReferralCompensation.jsx) - both are real, independent workflows with
// their own forms and multi-step state, not something to squeeze onto one
// shared Overview alongside everything else. Notes live on ReferralLog.jsx,
// task assignment on ReferralTasks.jsx.

// Requires a providerId now (migration_031) so the receiving officer's
// provider-scoped queue actually shows this case - see
// backend/src/dwo/routes/dwo.routes.js's hand-off-rehabilitation route.
function HandOffRehabCard({ referralId, onHandedOff }) {
  const [providerId, setProviderId] = useState('');
  const [error, setError] = useState(null);
  const providersQuery = useRehabilitationProviders();
  const handOffRehab = useHandOffRehabilitation();
  const providers = providersQuery.data?.providers || [];

  const handleSubmit = async () => {
    if (!providerId) return;
    setError(null);
    try {
      await handOffRehab.mutate(referralId, providerId);
      onHandedOff();
    } catch (err) {
      setError(err.message || 'Could not hand off to Rehabilitation Officer. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <HeartHandshake size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Forward to Rehabilitation Officer</h3>
      </div>
      <p className="text-[11px] text-gray-400">Select the government or NGO centre this case is being handed to.</p>
      <select
        value={providerId}
        onChange={(e) => setProviderId(e.target.value)}
        disabled={providersQuery.loading}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
      >
        <option value="" disabled>{providersQuery.loading ? 'Loading centres...' : 'Select a centre...'}</option>
        {providers.map((p) => (
          <option key={p.providerId} value={p.providerId}>{p.name} ({p.providerType})</option>
        ))}
      </select>
      <button
        onClick={handleSubmit}
        disabled={!providerId || handOffRehab.loading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border border-[#3D5A80] text-[#3D5A80] hover:bg-[#EBF4FA] rounded-lg text-xs font-semibold transition disabled:opacity-60"
      >
        <HeartHandshake size={14} />
        {handOffRehab.loading ? 'Forwarding...' : 'Forward to Rehabilitation Officer'}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export default function ReferralDetail() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState(null);
  const detailQuery = useReferralDetail(referralId);
  const resolve = useResolveReferral();

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <StaffLayout title="Referral Overview"><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (detailQuery.error || !r) {
    return (
      <StaffLayout title="Referral Overview">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          {detailQuery.error || 'This referral could not be located.'}
        </div>
      </StaffLayout>
    );
  }

  const handleResolve = async () => {
    setActionError(null);
    try {
      await resolve.mutate(referralId);
      navigate('/dwo');
    } catch (err) {
      setActionError(err.message || 'Could not resolve this referral. Kindly try again.');
    }
  };

  return (
    <StaffLayout title="Referral Overview">
      <div className="space-y-4">
        <ReferralHeader r={r} backTo="/dwo" backLabel="Back to Referral Queue" onResolve={handleResolve} resolveLoading={resolve.loading} />
        <ReferralSubNav base={`/dwo/referrals/${referralId}`} />

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
          <div className="lg:col-span-2 space-y-6">
            {r.reason ? (
              <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Referral Context</h3>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.reason}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-400">No referral context was provided.</p>
            )}
          </div>

          <div className="space-y-6">
            {r.status === 'Open' && (
              <HandOffRehabCard referralId={referralId} onHandedOff={() => navigate('/dwo')} />
            )}
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
