import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import ReferralHeader from '../components/ReferralHeader';
import ReferralSubNav from '../components/ReferralSubNav';
import { IndianRupee, CircleCheck, Lock, Landmark, FileText, AlertCircle } from 'lucide-react';
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
            {compensation.stages.map((s, idx) => {
              const stageName = s.stage?.toLowerCase().startsWith('stage') ? s.stage : `Stage ${idx + 1}`;
              return (
              <div key={s.stage || idx} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${s.status === 'Paid' ? 'border-emerald-200 bg-emerald-50' : s.unlocked ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{stageName} <span className="text-gray-400 font-normal">({s.percentage}%)</span></p>
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
            ); })}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

// migration_038 - the account a payment stage is actually disbursed into.
// Compensation under the Act is paid by direct transfer, so "Mark Paid" is
// refused server-side while this is missing - without showing it here, the
// officer would hit that refusal with no way to see why, or where the money
// is meant to go.
function BankDetailsCard({ r }) {
  const b = r.bankDetails;

  if (!b) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-2">
        <div className="flex items-center gap-1.5">
          <AlertCircle size={15} className="text-amber-700" />
          <h3 className="font-bold text-sm text-amber-800">No Bank Account on Record</h3>
        </div>
        <p className="text-[11px] text-amber-700 leading-relaxed">
          Compensation is disbursed by direct transfer, so no payment stage can be marked paid until this victim
          adds an account. They can do that themselves under Compensation in their own app.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <Landmark size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Disbursement Account</h3>
      </div>
      <p className="text-[11px] text-gray-400">
        Provided by the victim. Kindly verify against the proof below before releasing a payment stage.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Account Holder</span>
          <span className="text-xs font-bold text-gray-800">{b.accountName}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Account Number</span>
          <span className="text-xs font-bold text-gray-800 tabular-nums">{b.accountNumber}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">IFSC</span>
          <span className="text-xs font-bold text-gray-800">{b.ifsc}</span>
        </div>
        {b.bankName && (
          <div>
            <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Bank</span>
            <span className="text-xs font-bold text-gray-800">{b.bankName}</span>
          </div>
        )}
      </div>
      {b.proofUrl ? (
        <a
          href={b.proofUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#EBF4FA] rounded-md text-[11px] font-semibold transition"
        >
          <FileText size={12} /> View passbook / cheque proof
        </a>
      ) : (
        <p className="text-[11px] text-gray-400">No proof document attached - optional, but useful before releasing funds.</p>
      )}
      {b.updatedAt && (
        <p className="text-[10px] text-gray-400">Last updated {new Date(b.updatedAt).toLocaleString()}</p>
      )}
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

        <div className="pt-2 space-y-4">
          <CompensationCard r={r} referralId={referralId} onChanged={detailQuery.refetch} />
          <BankDetailsCard r={r} />
        </div>
      </div>
    </StaffLayout>
  );
}
