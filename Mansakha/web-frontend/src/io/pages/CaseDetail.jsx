import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import CaseHeader from '../components/CaseHeader';
import CaseSubNav from '../components/CaseSubNav';
import { ShieldAlert, FileText, Send, AlertTriangle } from 'lucide-react';
import {
  useCaseDetail, useSetAccusedStatus, useSetInvestigationProgress,
  useFileChargesheet, useMarkInvestigationComplete, useAlertProtectionOfficer,
} from '../services/hooks';

// Investigating Officer's Case Overview - accused status, victim-safe
// investigation progress, chargesheet filing (the one write path into the
// shared case_stage - advances Investigation to Trial, unlocking DWO's
// Compensation Stage 2), and alerting Protection Officer on a detected
// threat. Notes live on CaseLog.jsx, task assignment on CaseTasks.jsx.

const ACCUSED_STATUSES = ['In Custody', 'Out on Bail', 'Absconding', 'Convicted'];

function AccusedStatusCard({ c, userId, onChanged }) {
  const [accusedStatus, setAccusedStatus] = useState(c.accusedStatus || '');
  const [error, setError] = useState(null);
  const setStatus = useSetAccusedStatus();

  const handleSave = async () => {
    if (!accusedStatus) return;
    setError(null);
    try {
      await setStatus.mutate(userId, accusedStatus);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not update accused status. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <ShieldAlert size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Accused Status</h3>
      </div>
      <p className="text-[11px] text-gray-400">The real signal Threat Tier is computed from - kindly keep this current as custody/bail status changes.</p>
      <div className="flex flex-wrap items-center gap-3">
        <select value={accusedStatus} onChange={(e) => setAccusedStatus(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-xs">
          <option value="" disabled>Select status...</option>
          {ACCUSED_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={handleSave}
          disabled={!accusedStatus || accusedStatus === c.accusedStatus || setStatus.loading}
          className="px-4 py-2 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
        >
          {setStatus.loading ? 'Saving...' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function InvestigationProgressCard({ c, userId, onChanged }) {
  const [text, setText] = useState(c.investigationProgress || '');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const setProgress = useSetInvestigationProgress();

  const handleSave = async () => {
    if (!text.trim()) return;
    setError(null);
    setSuccess(false);
    try {
      await setProgress.mutate(userId, text.trim());
      setSuccess(true);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not update progress. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <FileText size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Investigation Progress</h3>
      </div>
      <p className="text-[11px] text-gray-400">Shown to the victim on their own Case Details - a plain summary only, never confidential evidence. Raw investigative detail belongs in the Activity Log instead.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. Statement recorded from victim and witnesses; forensic report awaited."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
      />
      <button
        onClick={handleSave}
        disabled={!text.trim() || setProgress.loading}
        className="px-4 py-2 border border-[#3D5A80] text-[#3D5A80] hover:bg-[#EBF4FA] rounded-lg text-xs font-semibold transition disabled:opacity-60"
      >
        {setProgress.loading ? 'Saving...' : 'Update Progress'}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {success && <p className="text-xs text-emerald-600">Progress updated - the victim can now see this.</p>}
    </div>
  );
}

function ChargesheetCard({ c, userId, onChanged }) {
  const [error, setError] = useState(null);
  const fileChargesheet = useFileChargesheet();

  const handleFile = async () => {
    if (!window.confirm('Filing the chargesheet will advance this case from Investigation to Trial, and unlock the second Compensation payment stage. Continue?')) return;
    setError(null);
    try {
      await fileChargesheet.mutate(userId);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not file chargesheet. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <h3 className="font-bold text-sm text-gray-800">Chargesheet</h3>
      {c.chargesheetStatus === 'Filed' ? (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 w-fit">
          Filed on {new Date(c.chargesheetFiledAt).toLocaleDateString()} - case has advanced to Trial.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-gray-400">Filing the chargesheet advances this case's stage from Investigation to Trial, and unlocks DWO's second Compensation payment stage.</p>
          <button
            onClick={handleFile}
            disabled={fileChargesheet.loading}
            className="px-4 py-2 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
          >
            {fileChargesheet.loading ? 'Filing...' : 'Mark Chargesheet as Filed'}
          </button>
        </>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function AlertProtectionOfficerCard({ c, userId, onChanged }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const alertPo = useAlertProtectionOfficer();

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setError(null);
    try {
      await alertPo.mutate(userId, reason.trim());
      setReason('');
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not alert Protection Officer. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <AlertTriangle size={15} className="text-rose-600" />
        <h3 className="font-bold text-sm text-gray-800">Alert Protection Officer</h3>
      </div>
      <p className="text-[11px] text-gray-400">Raises a real, actionable referral for the case's jurisdiction Protection Officer - use this when the investigation surfaces a threat to the victim.</p>
      {c.threatAlertedAt && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 w-fit">
          Last alerted {new Date(c.threatAlertedAt).toLocaleString()}
        </p>
      )}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Describe the detected threat..."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
      />
      <button
        onClick={handleSubmit}
        disabled={!reason.trim() || alertPo.loading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
      >
        <Send size={13} />
        {alertPo.loading ? 'Alerting...' : 'Send Alert'}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export default function CaseDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState(null);
  const detailQuery = useCaseDetail(userId);
  const markComplete = useMarkInvestigationComplete();

  const c = detailQuery.data;

  if (detailQuery.loading) {
    return <StaffLayout title="Case Overview"><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (detailQuery.error || !c) {
    return (
      <StaffLayout title="Case Overview">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          {detailQuery.error || 'This case could not be located.'}
        </div>
      </StaffLayout>
    );
  }

  const handleMarkComplete = async () => {
    setActionError(null);
    try {
      await markComplete.mutate(userId);
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not mark investigation complete. Kindly try again.');
    }
  };

  return (
    <StaffLayout title="Case Overview">
      <div className="space-y-4">
        <CaseHeader c={c} backTo="/io" backLabel="Back to Case Queue" onMarkComplete={handleMarkComplete} markCompleteLoading={markComplete.loading} />
        <CaseSubNav base={`/io/cases/${userId}`} />

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
          <div className="lg:col-span-2 space-y-6">
            <AccusedStatusCard c={c} userId={userId} onChanged={detailQuery.refetch} />
            <InvestigationProgressCard c={c} userId={userId} onChanged={detailQuery.refetch} />
            <ChargesheetCard c={c} userId={userId} onChanged={detailQuery.refetch} />
          </div>
          <div className="space-y-6">
            <AlertProtectionOfficerCard c={c} userId={userId} onChanged={detailQuery.refetch} />
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
