import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import ReferralHeader from '../components/ReferralHeader';
import ReferralSubNav from '../components/ReferralSubNav';
import { IndianRupee, ShieldCheck, AlertTriangle, CircleCheck } from 'lucide-react';
import { useReferralDetail, useResolveReferral, useApproveImmediateRelief, useMarkReliefProvided } from '../services/hooks';

// District Welfare Officer's Immediate Relief - its own dedicated page, not
// a card sharing Overview with Compensation. This is the fast, urgent-need
// track (money, food, shelter); see ReferralCompensation.jsx for the
// separate, larger statutory award tracked in stages.

const ASSISTANCE_TYPES = ['Financial', 'Essential Support'];

const COMPLIANCE_BADGE = {
  'On Track': { cls: 'bg-sky-100 text-sky-700', icon: ShieldCheck },
  Overdue: { cls: 'bg-rose-100 text-rose-700', icon: AlertTriangle },
};

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

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
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4 max-w-2xl">
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
            className="px-4 py-2 bg-brand-800 hover:bg-[#1a1d45] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
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
              className="px-4 py-2 border border-brand-900 text-brand-900 hover:bg-brand-50 rounded-lg text-xs font-semibold transition disabled:opacity-60"
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

export default function ReferralRelief() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState(null);
  const detailQuery = useReferralDetail(referralId);
  const resolve = useResolveReferral();

  usePageHeader({ title: 'Immediate Relief' });

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }
  if (detailQuery.error || !r) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
        {detailQuery.error || 'This referral could not be located.'}
      </div>
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
    <>
      <div className="space-y-4">
        <ReferralHeader r={r} backTo="/dwo" backLabel="Back to Referral Queue" onResolve={handleResolve} resolveLoading={resolve.loading} />
        <ReferralSubNav base={`/dwo/referrals/${referralId}`} />

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="pt-2">
          <ImmediateReliefCard r={r} referralId={referralId} onChanged={detailQuery.refetch} />
        </div>
      </div>
    </>
  );
}
