import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import CaseHeader from '../components/CaseHeader';
import CaseSubNav from '../components/CaseSubNav';
import { ShieldAlert, FileText, Send, AlertTriangle, Upload, Download, ShieldOff } from 'lucide-react';
import {
  useCaseDetail, useSetAccusedStatus, useSetInvestigationProgress,
  useFileChargesheet, useMarkInvestigationComplete, useAlertProtectionOfficer,
  useUploadCaseDocument,
} from '../services/hooks';

// Investigating Officer's Case Overview - accused status, victim-safe
// investigation progress, chargesheet filing, and alerting Protection
// Officer on a detected threat. migration_034: filing a chargesheet no
// longer touches the shared case_stage - that's now exclusively the
// (simulated) eCourt sync worker's authority (core/services/
// ecourtStageSync.js). It only records chargesheetStatus/chargesheetFiledAt
// on this case's own investigation record. Notes live on CaseLog.jsx, task
// assignment on CaseTasks.jsx.

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
    if (!window.confirm('Mark the chargesheet as filed for this case? This records the filing date on the case record - the case\'s stage itself is updated separately by the eCourt system.')) return;
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
          Filed on {new Date(c.chargesheetFiledAt).toLocaleDateString()}.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-gray-400">Records the chargesheet as filed on this case. The case's own eCourt stage (Investigation/Trial/etc.) is set exclusively by the eCourt system, not by this action.</p>
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

// migration_037 - Document Transparency. One row per document kind; the
// uploaded PDF binds to this case's own record and immediately becomes a
// Download button on the victim's own Case Details.
function CaseDocumentRow({ label, documentType, existingUrl, userId, onChanged }) {
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const upload = useUploadCaseDocument();

  const handleSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      await upload.mutate(userId, documentType, file);
      onChanged();
    } catch (err) {
      setError(err.message || `Could not upload the ${label}. Kindly try again.`);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3.5 py-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-800">{label}</p>
        <p className="text-[10px] text-gray-400">
          {existingUrl ? 'Uploaded - the victim can download this from their own Case Details.' : 'Not uploaded yet.'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {existingUrl && (
          <a
            href={existingUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#519BCE] text-[#519BCE] hover:bg-[#EBF4FA] rounded-md text-[11px] font-semibold transition"
          >
            <Download size={12} /> View
          </a>
        )}
        <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleSelected} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-md text-[11px] font-semibold transition disabled:opacity-60"
        >
          <Upload size={12} />
          {upload.loading ? 'Uploading...' : existingUrl ? 'Replace PDF' : 'Upload PDF'}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600 w-full">{error}</p>}
    </div>
  );
}

function CaseDocumentsCard({ c, userId, onChanged }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <FileText size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Case Documents</h3>
      </div>
      <p className="text-[11px] text-gray-400">
        PDF only. Uploading here immediately gives the victim a Download button on their own Case Details - retrieval always goes through a short-lived signed link, never a permanent public URL.
      </p>
      <CaseDocumentRow label="FIR Copy" documentType="fir" existingUrl={c.firDocumentUrl} userId={userId} onChanged={onChanged} />
      <CaseDocumentRow label="Chargesheet" documentType="chargesheet" existingUrl={c.chargesheetDocumentUrl} userId={userId} onChanged={onChanged} />
    </div>
  );
}

// The Privacy Shield, stated plainly for the officer: this portal never
// receives the victim's contact details at all (see io.routes.js's own
// comment) - a case is identified by docket number alone.
function PrivacyShieldNote() {
  return (
    <div className="flex items-start gap-2 bg-[#EBF4FA]/60 border border-[#D6E8F5] rounded-lg px-3.5 py-2.5">
      <ShieldOff size={14} className="text-[#3D5A80] mt-0.5 shrink-0" />
      <p className="text-[11px] text-[#3D5A80] leading-relaxed">
        <span className="font-bold">Privacy Shield.</span> The victim's name, phone number and address are never sent to this portal - cases are identified by docket number only. Contact must be made through the assigned Counsellor or Protection Officer.
      </p>
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
            <CaseDocumentsCard c={c} userId={userId} onChanged={detailQuery.refetch} />
          </div>
          <div className="space-y-6">
            <PrivacyShieldNote />
            <AlertProtectionOfficerCard c={c} userId={userId} onChanged={detailQuery.refetch} />
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
