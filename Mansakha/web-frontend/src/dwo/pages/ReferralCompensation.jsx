import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import ReferralHeader from '../components/ReferralHeader';
import ReferralSubNav from '../components/ReferralSubNav';
import { IndianRupee, CircleCheck, Lock, Landmark } from 'lucide-react';
import { useReferralDetail, useResolveReferral, useVerifyCompensation, useMarkCompensationStagePaid } from '../services/hooks';

// District Welfare Officer's Compensation Module - its own dedicated page,
// separate from Immediate Relief (ReferralRelief.jsx). This is the larger
// statutory PoA Act award, verified once and tracked across 3 payment
// stages tied to the case's own real progress - a genuinely different
// workflow from relief's fast approve-and-provide cycle.

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

function CompensationCard({ r, referralId, onChanged }) {
  const compensation = r.compensation;
  const [verifiedAmount, setVerifiedAmount] = useState(r.suggestedCompensation?.suggestedAmount || '');
  const [error, setError] = useState(null);
  const verify = useVerifyCompensation();
  const markPaid = useMarkCompensationStagePaid();

  const handleVerify = async () => {
    setError(null);
    try {
      await verify.mutate(referralId, Number(verifiedAmount));
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not verify compensation. Kindly try again.');
    }
  };

  const handleMarkPaid = async (idx) => {
    setError(null);
    try {
      await markPaid.mutate(referralId, idx);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not update payment stage. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4 max-w-2xl">
      <div className="flex items-center gap-1.5">
        <Landmark size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Compensation Module</h3>
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">
        Statutory category: <span className="font-semibold text-gray-600">{r.suggestedCompensation.statutoryCategory}</span>.
        Suggested amount is a starting figure per this app&apos;s own schedule - kindly verify and adjust as the case warrants.
      </p>

      {!compensation && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Verified Amount (₹)</label>
            <div className="relative">
              <IndianRupee size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="number" min="1" value={verifiedAmount} onChange={(e) => setVerifiedAmount(e.target.value)} className="w-52 pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs" />
            </div>
          </div>
          <button
            onClick={handleVerify}
            disabled={verify.loading || !verifiedAmount}
            className="px-4 py-2 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
          >
            {verify.loading ? 'Verifying...' : 'Verify & Track Compensation'}
          </button>
        </div>
      )}

      {compensation && (
        <div className="space-y-3">
          <p className="text-xs text-gray-600">Verified amount: <span className="font-semibold">{inr(compensation.verifiedAmount)}</span> on {new Date(compensation.verifiedAt).toLocaleDateString()}</p>
          <div className="space-y-2">
            {compensation.stages.map((s, idx) => (
              <div key={s.stage} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${s.status === 'Paid' ? 'border-emerald-200 bg-emerald-50' : s.unlocked ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{s.stage} <span className="text-gray-400 font-normal">({s.percentage}%)</span></p>
                  <p className="text-[11px] text-gray-500">{inr(s.amount)}{s.paidAt && ` • paid ${new Date(s.paidAt).toLocaleDateString()}`}</p>
                </div>
                {s.status === 'Paid' ? (
                  <span className="flex items-center gap-1 text-emerald-700 text-[11px] font-bold shrink-0"><CircleCheck size={13} /> Paid</span>
                ) : s.unlocked ? (
                  <button
                    onClick={() => handleMarkPaid(idx)}
                    disabled={markPaid.loading}
                    className="px-3 py-1.5 border border-[#3D5A80] text-[#3D5A80] hover:bg-[#EBF4FA] rounded-lg text-[11px] font-semibold transition disabled:opacity-60 shrink-0"
                  >
                    Mark as Paid
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-gray-400 text-[11px] font-semibold shrink-0"><Lock size={12} /> Locked until {s.unlocksAtCaseStage}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export default function ReferralCompensation() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState(null);
  const detailQuery = useReferralDetail(referralId);
  const resolve = useResolveReferral();

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <StaffLayout title="Compensation"><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (detailQuery.error || !r) {
    return (
      <StaffLayout title="Compensation">
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
    <StaffLayout title="Compensation">
      <div className="space-y-4">
        <ReferralHeader r={r} backTo="/dwo" backLabel="Back to Referral Queue" onResolve={handleResolve} resolveLoading={resolve.loading} />
        <ReferralSubNav base={`/dwo/referrals/${referralId}`} />

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="pt-2">
          <CompensationCard r={r} referralId={referralId} onChanged={detailQuery.refetch} />
        </div>
      </div>
    </StaffLayout>
  );
}
