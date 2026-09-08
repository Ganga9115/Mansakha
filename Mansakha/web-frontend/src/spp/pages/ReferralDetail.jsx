import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import ReferralHeader from '../components/ReferralHeader';
import ReferralSubNav from '../components/ReferralSubNav';
import { Gavel, FileCheck, Scale, Video, ShieldOff, AlertTriangle } from 'lucide-react';
import { useReferralDetail, useResolveReferral, useRequestHearing, useSetTestimonyAccommodation, useRecordCaseOutcome } from '../services/hooks';

// Special Public Prosecutor's Referral Overview - context and the real
// prosecution-specific depth: Case Priority, Victim Testimony Coordination,
// and structured Case Outcome (with a property-forfeiture flag per the
// SC/ST PoA Act's Chapter 7 provision). Notes moved to ReferralLog.jsx,
// task assignment moved to ReferralTasks.jsx.

const PRIORITY_BADGE = { Standard: 'bg-gray-100 text-gray-600', Elevated: 'bg-amber-100 text-amber-700', High: 'bg-rose-100 text-rose-700' };
const ACCOMMODATIONS = ['None', 'Video Conferencing', 'Screen Barrier'];
const VERDICTS = ['Conviction', 'Acquittal'];

function PriorityCard({ r }) {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
      <h3 className="font-bold text-sm text-gray-800 mb-3">Docket Priority</h3>
      <div className="flex items-center gap-6 flex-wrap">
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case Age</span>
          <span className="text-sm font-bold text-gray-800">{r.caseAgeDays} day{r.caseAgeDays === 1 ? '' : 's'}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Victim Distress</span>
          <span className="text-sm font-bold text-gray-800">{r.distressScore != null ? `${r.distressScore}/100` : 'No score yet'}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Priority</span>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${PRIORITY_BADGE[r.casePriority] || 'bg-gray-100 text-gray-600'}`}>{r.casePriority}</span>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-3">Priority rises with case age and victim distress, so ageing or escalating cases are not lost in a flat queue.</p>
    </div>
  );
}

function TestimonyCard({ r, referralId, onChanged }) {
  const [value, setValue] = useState(r.testimonyAccommodation || 'None');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const setAccommodation = useSetTestimonyAccommodation();

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    try {
      await setAccommodation.mutate(referralId, value);
      setSuccess(true);
      onChanged();
    } catch (err) {
      setError(err.message || 'Unable to update this request. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <Video size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Victim Testimony Coordination</h3>
      </div>
      <p className="text-[11px] text-gray-400">Request an accommodation so the victim need not face the accused in person while testifying.</p>
      <select value={value} onChange={(e) => setValue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs">
        {ACCOMMODATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <button
        onClick={handleSave}
        disabled={setAccommodation.loading || value === (r.testimonyAccommodation || 'None')}
        className="px-4 py-2 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
      >
        {setAccommodation.loading ? 'Saving...' : 'Save Request'}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {success && <p className="text-xs text-emerald-600">Testimony accommodation updated.</p>}
    </div>
  );
}

function CaseOutcomeCard({ r, referralId, onChanged }) {
  const [verdict, setVerdict] = useState('');
  const [sentence, setSentence] = useState('');
  const [compensationAwarded, setCompensationAwarded] = useState('');
  const [forfeitureOrdered, setForfeitureOrdered] = useState(false);
  const [error, setError] = useState(null);
  const recordOutcome = useRecordCaseOutcome();

  if (r.caseOutcome) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-2">
        <div className="flex items-center gap-1.5">
          <FileCheck size={15} className="text-emerald-600" />
          <h3 className="font-bold text-sm text-gray-800">Case Outcome</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${r.caseOutcome.verdict === 'Conviction' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
            {r.caseOutcome.verdict}
          </span>
          {r.caseOutcome.forfeitureOrdered && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
              <ShieldOff size={11} /> Property Forfeited
            </span>
          )}
        </div>
        {r.caseOutcome.sentence && <p className="text-xs text-gray-600">Sentence: {r.caseOutcome.sentence}</p>}
        {r.caseOutcome.compensationAwarded != null && <p className="text-xs text-gray-600">Compensation Awarded: ₹{r.caseOutcome.compensationAwarded.toLocaleString('en-IN')}</p>}
        <p className="text-[10px] text-gray-400">Recorded {new Date(r.caseOutcome.recordedAt).toLocaleString()} - the justice loop is now closed for this case.</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!verdict) return;
    setError(null);
    try {
      await recordOutcome.mutate(referralId, {
        verdict,
        sentence: sentence.trim() || undefined,
        compensationAwarded: compensationAwarded ? Number(compensationAwarded) : undefined,
        forfeitureOrdered,
      });
      onChanged();
    } catch (err) {
      setError(err.message || 'Unable to record the case outcome. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <Scale size={15} className="text-[#3D5A80]" />
        <h3 className="font-bold text-sm text-gray-800">Record Case Outcome</h3>
      </div>
      <p className="text-[11px] text-gray-400">Closes the justice loop - the victim's own case will show this outcome.</p>
      <select value={verdict} onChange={(e) => setVerdict(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs">
        <option value="" disabled>Select verdict...</option>
        {VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <input
        type="text"
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
        placeholder="Sentence (if convicted)..."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
      />
      <input
        type="number"
        min="0"
        value={compensationAwarded}
        onChange={(e) => setCompensationAwarded(e.target.value)}
        placeholder="Compensation awarded (₹, if any)"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
      />
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={forfeitureOrdered} onChange={(e) => setForfeitureOrdered(e.target.checked)} />
        Property forfeiture ordered (SC/ST PoA Act, Chapter 7)
      </label>
      <button
        onClick={handleSubmit}
        disabled={!verdict || recordOutcome.loading}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-[#3D5A80] hover:bg-[#2f4763] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
      >
        {recordOutcome.loading ? 'Recording...' : 'Record Outcome'}
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
  const requestHearing = useRequestHearing();

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
      navigate('/spp');
    } catch (err) {
      setActionError(err.message || 'Could not resolve this referral. Kindly try again.');
    }
  };

  const handleRequestHearing = async () => {
    setActionError(null);
    try {
      await requestHearing.mutate(referralId);
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not file hearing request. Kindly try again.');
    }
  };

  return (
    <StaffLayout title="Referral Overview">
      <div className="space-y-4">
        <ReferralHeader r={r} backTo="/spp" backLabel="Back to Trial Docket" onResolve={handleResolve} resolveLoading={resolve.loading} />
        <ReferralSubNav base={`/spp/referrals/${referralId}`} />

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
          <div className="lg:col-span-2 space-y-6">
            {r.reason && (
              <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Referral Context</h3>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.reason}</p>
              </div>
            )}
            <PriorityCard r={r} />
            <CaseOutcomeCard r={r} referralId={referralId} onChanged={detailQuery.refetch} />
          </div>

          <div className="space-y-6">
            {r.status === 'Open' && !r.metadata?.hearingRequested && !r.caseOutcome && (
              <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
                <h3 className="font-bold text-sm text-gray-800">Actions</h3>
                <button
                  onClick={handleRequestHearing}
                  disabled={requestHearing.loading}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded-lg text-xs font-semibold transition disabled:opacity-60"
                >
                  <Gavel size={14} />
                  {requestHearing.loading ? 'Filing...' : 'File Expedited Hearing Request'}
                </button>
              </div>
            )}
            {r.metadata?.hearingRequested && !r.caseOutcome && (
              <div className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs">
                <AlertTriangle size={13} />
                <span className="font-semibold">Expedited hearing request filed</span>
              </div>
            )}
            <TestimonyCard r={r} referralId={referralId} onChanged={detailQuery.refetch} />
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
