import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import ReferralHeader from '../components/ReferralHeader';
import ReferralSubNav from '../components/ReferralSubNav';
import { HeartHandshake, IndianRupee, ShieldCheck, AlertTriangle, CircleCheck, Lock, Landmark } from 'lucide-react';
import {
  useReferralDetail, useResolveReferral, useHandOffRehabilitation, useRehabilitationProviders,
  useApproveImmediateRelief, useMarkReliefProvided, useVerifyCompensation, useMarkCompensationStagePaid,
} from '../services/hooks';

// District Welfare Officer's Referral Overview - context, plus the two
// independent DWO tracks: Immediate Relief (fast, urgent financial/support
// aid) and the Compensation Module (the larger statutory award, tracked in
// 3 payment stages tied to the case's own real progress). Notes moved to
// ReferralLog.jsx, task assignment moved to ReferralTasks.jsx.

const ASSISTANCE_TYPES = ['Financial', 'Essential Support'];

const COMPLIANCE_BADGE = {
  'On Track': { cls: 'bg-sky-100 text-sky-700', icon: ShieldCheck },
  Overdue: { cls: 'bg-rose-100 text-rose-700', icon: AlertTriangle },
};

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

// ===== Immediate Relief =====
function ImmediateReliefCard({ r, referralId, onChanged }) {
  const relief = r.immediateRelief;
  const [assistanceTypes, setAssistanceTypes] = useState([]);
  const [financialAmount, setFinancialAmount] = useState('');
  const [essentialSupportNotes, setEssentialSupportNotes] = useState('');
  const [error, setError] = useState(null);
  const approve = useApproveImmediateRelief();
  const markProvided = useMarkReliefProvided();

  const toggleType = (t) => setAssistanceTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const handleApprove = async () => {
    setError(null);
    try {
      await approve.mutate(referralId, {
        assistanceTypes,
        financialAmount: assistanceTypes.includes('Financial') ? Number(financialAmount) : undefined,
        essentialSupportNotes: assistanceTypes.includes('Essential Support') ? essentialSupportNotes : undefined,
      });
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not approve relief. Kindly try again.');
    }
  };

  const handleMarkProvided = async () => {
    setError(null);
    try {
      await markProvided.mutate(referralId);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not update relief. Kindly try again.');
    }
  };

  const compliance = COMPLIANCE_BADGE[r.immediateReliefCompliance] || COMPLIANCE_BADGE['On Track'];
  const ComplianceIcon = compliance.icon;

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-sm text-gray-800">Immediate Relief</h3>
        {(!relief || relief.status === 'Requested') && (
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${compliance.cls}`}>
            <ComplianceIcon size={13} /> {r.immediateReliefCompliance}
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">Urgent financial assistance or essential support (medical, food, shelter). Kindly act within 7 days of the request.</p>

      {!relief && (
        <>
          <div className="flex flex-wrap gap-3">
            {ASSISTANCE_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <input type="checkbox" checked={assistanceTypes.includes(t)} onChange={() => toggleType(t)} className="rounded" />
                {t}
              </label>
            ))}
          </div>
          {assistanceTypes.includes('Financial') && (
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Financial Amount</label>
              <div className="relative">
                <IndianRupee size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="number" min="1" value={financialAmount} onChange={(e) => setFinancialAmount(e.target.value)} placeholder="e.g. 5000" className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs" />
              </div>
            </div>
          )}
          {assistanceTypes.includes('Essential Support') && (
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Essential Support Details</label>
              <textarea value={essentialSupportNotes} onChange={(e) => setEssentialSupportNotes(e.target.value)} rows={2} placeholder="e.g. Ration kit and temporary shelter arranged..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs" />
            </div>
          )}
          <button
            onClick={handleApprove}
            disabled={approve.loading || assistanceTypes.length === 0 || (assistanceTypes.includes('Financial') && !financialAmount) || (assistanceTypes.includes('Essential Support') && !essentialSupportNotes.trim())}
            className="px-4 py-2 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
          >
            {approve.loading ? 'Approving...' : 'Approve Relief'}
          </button>
        </>
      )}

      {relief && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {relief.assistanceTypes.map((t) => (
              <span key={t} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">{t}</span>
            ))}
          </div>
          {relief.financialAmount != null && <p className="text-xs text-gray-600">Financial: <span className="font-semibold">{inr(relief.financialAmount)}</span></p>}
          {relief.essentialSupportNotes && <p className="text-xs text-gray-600">Essential Support: {relief.essentialSupportNotes}</p>}
          <p className="text-[11px] text-gray-400">Approved on {new Date(relief.approvedAt).toLocaleString()}</p>

          {relief.status === 'Approved' && (
            <button
              onClick={handleMarkProvided}
              disabled={markProvided.loading}
              className="px-4 py-2 border border-[#3D5A80] text-[#3D5A80] hover:bg-[#EBF4FA] rounded-lg text-xs font-semibold transition disabled:opacity-60"
            >
              {markProvided.loading ? 'Updating...' : 'Mark as Provided'}
            </button>
          )}
          {relief.status === 'Provided' && (
            <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-fit text-xs font-semibold">
              Provided on {new Date(relief.providedAt).toLocaleString()} - awaiting victim confirmation
            </div>
          )}
          {relief.status === 'Confirmed' && (
            <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 w-fit text-xs font-semibold">
              <CircleCheck size={14} /> Confirmed received by victim on {new Date(relief.confirmedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

// ===== Compensation Module =====
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
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
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
            {r.reason && (
              <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Referral Context</h3>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.reason}</p>
              </div>
            )}
            <ImmediateReliefCard r={r} referralId={referralId} onChanged={detailQuery.refetch} />
            <CompensationCard r={r} referralId={referralId} onChanged={detailQuery.refetch} />
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
