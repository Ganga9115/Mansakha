import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import ReferralHeader from '../components/ReferralHeader';
import ReferralSubNav from '../components/ReferralSubNav';
import { HeartHandshake, IndianRupee, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useReferralDetail, useResolveReferral, useHandOffRehabilitation, useSetRelief } from '../services/hooks';

// District Welfare Officer's Referral Overview - context and the Relief &
// Compliance card (DWO's real statutory function: relief type, sanctioned
// amount, and a 7-day compliance flag), now on its own page instead of one
// of several stacked cards. Notes moved to ReferralLog.jsx, task assignment
// moved to ReferralTasks.jsx - each concern gets real room. THE TEMPLATE
// for the other 6 role folders' equivalent Overview page.

const COMPLIANCE_BADGE = {
  Sanctioned: { cls: 'bg-emerald-100 text-emerald-700', icon: ShieldCheck },
  'On Track': { cls: 'bg-sky-100 text-sky-700', icon: ShieldCheck },
  Overdue: { cls: 'bg-rose-100 text-rose-700', icon: AlertTriangle },
};

const RELIEF_TYPES = ['Interim Relief', 'Final Relief', 'Rehabilitation Grant'];

function ReliefComplianceCard({ r, referralId, onChanged }) {
  const [reliefType, setReliefType] = useState(r.reliefType || '');
  const [reliefAmount, setReliefAmount] = useState(r.reliefAmount || '');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const setRelief = useSetRelief();

  const compliance = COMPLIANCE_BADGE[r.complianceStatus] || COMPLIANCE_BADGE['On Track'];
  const ComplianceIcon = compliance.icon;

  const handleSave = async (markSanctioned) => {
    setError(null);
    setSuccess(false);
    try {
      await setRelief.mutate(referralId, {
        reliefType: reliefType || undefined,
        reliefAmount: reliefAmount ? Number(reliefAmount) : undefined,
        sanctioned: markSanctioned || undefined,
      });
      setSuccess(true);
      onChanged();
    } catch (err) {
      setError(err.message || 'Unable to update relief details. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-sm text-gray-800">Relief &amp; Compliance</h3>
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${compliance.cls}`}>
          <ComplianceIcon size={13} /> {r.complianceStatus}
        </span>
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">Statutory relief must be sanctioned within 7 days of registration. This tracks that automatically.</p>

      {r.sanctionedAt && (
        <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 w-fit text-xs">
          <ShieldCheck size={14} />
          <span className="font-semibold">Sanctioned on {new Date(r.sanctionedAt).toLocaleString()}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Relief Type</label>
          <select value={reliefType} onChange={(e) => setReliefType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs">
            <option value="" disabled>Select relief type...</option>
            {RELIEF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Amount (₹)</label>
          <div className="relative">
            <IndianRupee size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="number"
              min="1"
              value={reliefAmount}
              onChange={(e) => setReliefAmount(e.target.value)}
              placeholder="e.g. 25000"
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => handleSave(false)}
          disabled={setRelief.loading || (!reliefType && !reliefAmount)}
          className="px-4 py-2 border border-[#3D5A80] text-[#3D5A80] hover:bg-[#EBF4FA] rounded-lg text-xs font-semibold transition disabled:opacity-60"
        >
          {setRelief.loading ? 'Saving...' : 'Save Relief Details'}
        </button>
        {!r.sanctionedAt && (
          <button
            onClick={() => handleSave(true)}
            disabled={setRelief.loading || !reliefType || !reliefAmount}
            className="px-4 py-2 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
          >
            Mark Sanctioned
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {success && <p className="text-xs text-emerald-600">Relief details updated.</p>}
    </div>
  );
}

export default function ReferralDetail() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState(null);
  const detailQuery = useReferralDetail(referralId);
  const resolve = useResolveReferral();
  const handOffRehab = useHandOffRehabilitation();

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

  const handleHandOffRehab = async () => {
    setActionError(null);
    try {
      await handOffRehab.mutate(referralId);
      navigate('/dwo');
    } catch (err) {
      setActionError(err.message || 'Could not hand off to Rehabilitation Officer. Kindly try again.');
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
            <ReliefComplianceCard r={r} referralId={referralId} onChanged={detailQuery.refetch} />
          </div>

          <div className="space-y-6">
            {r.status === 'Open' && (
              <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
                <h3 className="font-bold text-sm text-gray-800">Actions</h3>
                <button
                  onClick={handleHandOffRehab}
                  disabled={handOffRehab.loading}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border border-[#3D5A80] text-[#3D5A80] hover:bg-[#EBF4FA] rounded-lg text-xs font-semibold transition disabled:opacity-60"
                >
                  <HeartHandshake size={14} />
                  {handOffRehab.loading ? 'Forwarding...' : 'Forward to Rehabilitation Officer'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
