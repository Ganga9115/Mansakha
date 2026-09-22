import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { ArrowLeft, CheckCircle2, Send, ShieldCheck, ShieldAlert, MapPin, AlertOctagon, User, Phone, Home } from 'lucide-react';
import { useReferralDetail, useAddReferralNote, useResolveReferral, useSetManualThreatTier, useCompleteDirective } from '../services/hooks';
import GlideSelect from '../../shared/components/GlideSelect';

// Deliberately NOT the distress score's Low/Moderate/High/Critical palette -
// Threat Tier is a different axis (external danger, not psychological
// distress).
const THREAT_TIER_BADGE = {
  Routine: 'bg-gray-100 text-gray-600',
  Guarded: 'bg-yellow-100 text-yellow-700',
  Elevated: 'bg-orange-100 text-orange-700',
  Severe: 'bg-rose-100 text-rose-700',
};
const THREAT_TIERS = ['Routine', 'Guarded', 'Elevated', 'Severe'];

// Origin badge - which of the 4 real paths brought this case into the
// Protection Registry (see protectionOfficer.routes.js's ORIGIN_PRIORITY).
// A case with no originType predates this field and simply shows nothing.
const ORIGIN_META = {
  sos_emergency: { label: 'Emergency SOS', className: 'bg-rose-100 text-rose-700' },
  io_threat_alert: { label: 'IO Threat Alert', className: 'bg-orange-100 text-orange-700' },
  intervention_accepted: { label: 'Witness Protection/Relocation', className: 'bg-brand-100 text-brand-700' },
  self_reported_threat: { label: 'Self-Reported Threat', className: 'bg-amber-100 text-amber-700' },
};

// System-assessed (computed, from IO's own custody status + real SOS
// history) and officer-assessed (this role's own manual judgment call) are
// shown side by side, never one silently replacing the other - the
// underlying IO/SOS signal must stay visible even after an override.
function ThreatAssessmentCard({ r, onChanged }) {
  const [manualTier, setManualTier] = useState(r.manualThreatTier || '');
  const [error, setError] = useState(null);
  const setTier = useSetManualThreatTier();

  const handleSave = async () => {
    setError(null);
    try {
      await setTier.mutate(r.referralId, manualTier || null);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not update Threat Tier. Kindly try again.');
    }
  };

  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <ShieldAlert size={15} className="text-brand-900" />
        <h3 className="font-bold text-sm text-gray-800">Threat Assessment</h3>
      </div>

      <div>
        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">System-Assessed</span>
        <p className="text-[11px] text-gray-400 mb-1.5">From Investigating Officer's custody status + real SOS history on this case.</p>
        {r.threatTier ? (
          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold ${THREAT_TIER_BADGE[r.threatTier] || 'bg-gray-100 text-gray-600'}`}>
            {r.threatTier}
          </span>
        ) : (
          <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-500">Not yet assessed</span>
        )}
      </div>

      <div className="pt-3 border-t border-gray-100">
        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Officer-Assessed (Your Override)</span>
        <p className="text-[11px] text-gray-400 mb-2">
          Set this only if you know something the system can't see (e.g. a credible verbal threat with no SOS event yet). Never replaces the system assessment above - both are always kept visible.
        </p>
        <div className="flex items-center gap-2">
          <GlideSelect
            options={[{ value: '', label: 'No override' }, ...THREAT_TIERS.map((t) => ({ value: t, label: t }))]}
            value={manualTier}
            onChange={(val) => setManualTier(val)}
            ariaLabel="Officer-Assessed Threat Tier Override"
            className="flex-1"
          />
          <button
            onClick={handleSave}
            disabled={setTier.loading || manualTier === (r.manualThreatTier || '')}
            className="px-3 py-2 bg-brand-800 hover:bg-[#1a1d45] text-white rounded-lg text-xs font-semibold transition disabled:opacity-50 shrink-0"
          >
            {setTier.loading ? 'Saving...' : 'Save'}
          </button>
        </div>
        {r.manualThreatTierSetAt && (
          <p className="text-[10px] text-gray-400 mt-1.5">Last set {new Date(r.manualThreatTierSetAt).toLocaleString()}</p>
        )}
        {error && <p className="text-xs text-rose-600 mt-1.5">{error}</p>}
      </div>
    </div>
  );
}

// Dispatch details - the one place in this system where an officials-side
// role sees a victim's name, phone and address. Justified precisely because
// this role is physically dispatched to find and protect a person, often on
// an emergency SOS: an officer with only a docket number cannot knock on a
// door or call back when a GPS fix is stale. Scoped to the single case being
// opened (never the queue listing) and audit-logged server-side on every
// read.
function DispatchDetailsCard({ r }) {
  if (!r.victimName && !r.victimContactNumber && !r.victimAddress) return null;
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <User size={15} className="text-brand-900" />
        <h3 className="font-bold text-sm text-gray-800">Dispatch Details</h3>
      </div>
      <p className="text-[11px] text-gray-400">
        Shown so you can actually reach this person. Every view of these details is recorded in the audit log.
      </p>
      {r.victimName && (
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Name</span>
          <span className="text-xs font-bold text-gray-800">{r.victimName}</span>
        </div>
      )}
      {r.victimContactNumber && (
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-0.5">Contact</span>
          <a href={`tel:${r.victimContactNumber}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline">
            <Phone size={12} /> {r.victimContactNumber}
          </a>
        </div>
      )}
      {r.victimAddress && (
        <div>
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-0.5">Address</span>
          <span className="flex items-start gap-1.5 text-xs text-gray-700 leading-relaxed">
            <Home size={12} className="mt-0.5 shrink-0 text-gray-400" /> {r.victimAddress}
          </span>
        </div>
      )}
    </div>
  );
}

// Inbound directives FOR this case from a concerned office (only District
// Collector has statutory authority to direct Protection Officer - this
// role has no outbound "Assign Action Item" of its own any more). Replaces
// the old standalone "My Tasks" page/sidebar entry entirely - a directive
// about a case belongs on that case's own record, not a separate portal-
// wide list.
function PendingDirectivesCard({ referralId, directives, onChanged }) {
  const complete = useCompleteDirective();
  const [completingId, setCompletingId] = useState(null);
  const [error, setError] = useState(null);

  if (!directives || directives.length === 0) return null;

  const handleComplete = async (taskId) => {
    setError(null);
    setCompletingId(taskId);
    try {
      await complete.mutate(taskId);
      onChanged();
    } catch (err) {
      setError(err.message || 'Could not update this directive. Kindly try again.');
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-1.5">
        <AlertOctagon size={15} className="text-amber-700" />
        <h3 className="font-bold text-sm text-amber-800">Pending Directive{directives.length > 1 ? 's' : ''}</h3>
      </div>
      {directives.map((d) => (
        <div key={d.taskId} className="bg-white border border-amber-200 rounded-lg p-3 space-y-1.5">
          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{d.action}</p>
          <p className="text-[10px] text-gray-400">
            From {d.createdByName}{d.dueAt ? ` - due ${new Date(d.dueAt).toLocaleDateString()}` : ''}
          </p>
          <button
            onClick={() => handleComplete(d.taskId)}
            disabled={completingId === d.taskId}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-md text-[11px] font-semibold transition disabled:opacity-60"
          >
            <CheckCircle2 size={12} />
            {completingId === d.taskId ? 'Working...' : 'Mark Complete'}
          </button>
        </div>
      ))}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

// Fixed, auditable picklist - mirrors backend/src/protection_officer/routes/
// protectionOfficer.routes.js's RESOLUTION_OUTCOME_CATEGORIES exactly. This
// is what actually closes the loop back to the victim (see
// user.routes.js's GET /threat-status) - "Resolved" alone explains nothing.
const OUTCOME_CATEGORIES = [
  'Safe Shelter Coordinated',
  'Relocation Facilitated',
  'Police Escort Provided',
  'Medical Support Arranged',
  'Threat Neutralized - No Relocation Required',
  'Other',
];

function ResolveDialog({ referralId, onResolved, onCancel }) {
  const [category, setCategory] = useState('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState(null);
  const resolve = useResolveReferral();

  const handleSubmit = async () => {
    if (!category) { setError('Kindly select an outcome.'); return; }
    if (category === 'Other' && !detail.trim()) { setError('Kindly describe the outcome.'); return; }
    setError(null);
    try {
      await resolve.mutate(referralId, category, detail.trim() || undefined);
      onResolved();
    } catch (err) {
      setError(err.message || 'Could not resolve this referral. Kindly try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-bold text-gray-800">Mark Resolved</h3>
        <p className="text-xs text-gray-500">
          Record what was actually done - this is what the victim sees on their own Case Details, not just a "Resolved" status.
        </p>
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Outcome</label>
          <GlideSelect
            options={OUTCOME_CATEGORIES}
            value={category}
            onChange={(val) => setCategory(val)}
            placeholder="Select..."
            ariaLabel="Outcome"
            menuWidth={300}
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
            Detail {category === 'Other' ? '(required)' : '(optional)'}
          </label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder="Additional context for the case record..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={resolve.loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-60"
          >
            {resolve.loading ? 'Resolving...' : 'Confirm Resolved'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Protection Officer's Referral Detail - the full case record for one
// referral: origin/location, the weekly safety-verification log, Threat
// Assessment (system + officer), any pending directive, and Mark Resolved.
// No "Assign Action Item" - this role has no statutory authority to raise
// cross-departmental directives (only District Collector does).

const STATUS_BADGE = { Open: 'bg-amber-100 text-amber-700', Resolved: 'bg-emerald-100 text-emerald-700' };

export default function ReferralDetail() {
  const { referralId } = useParams();
  const navigate = useNavigate();
  const [noteText, setNoteText] = useState('');
  const [actionError, setActionError] = useState(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const detailQuery = useReferralDetail(referralId);
  const addNote = useAddReferralNote();

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <StaffLayout title="Referral Detail"><p className="text-sm text-gray-400">Loading...</p></StaffLayout>;
  }
  if (detailQuery.error || !r) {
    return (
      <StaffLayout title="Referral Detail">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
          {detailQuery.error || 'This referral could not be located.'}
        </div>
      </StaffLayout>
    );
  }

  const handleVerify = async () => {
    setActionError(null);
    try {
      await addNote.mutate(referralId, noteText.trim() || 'Weekly safety verification complete - no incidents reported.');
      setNoteText('');
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not log verification. Kindly try again.');
    }
  };

  const origin = r.originType ? ORIGIN_META[r.originType] : null;

  return (
    <StaffLayout title="Referral Detail">
      <div className="space-y-6">
        <button onClick={() => navigate('/protectionofficer')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Back to Protection Registry
        </button>

        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-10 flex-wrap">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Docket Number</span>
              <span className="text-base font-bold text-gray-800">{r.docketNumber}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case Type</span>
              <span className="text-xs font-bold text-gray-700">{r.caseTypeName}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Status</span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
            </div>
            {origin && (
              <div>
                <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Origin</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${origin.className}`}>{origin.label}</span>
              </div>
            )}
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Referred On</span>
              <span className="text-xs font-bold text-gray-700">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
          </div>
          {r.status === 'Open' && (
            <button
              onClick={() => setShowResolveDialog(true)}
              className="flex items-center gap-1.5 px-4 py-2 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold transition shrink-0"
            >
              <CheckCircle2 size={14} />
              Mark Resolved
            </button>
          )}
        </div>

        {r.location && (
          <a
            href={`https://www.google.com/maps?q=${r.location.lat},${r.location.lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-brand-600 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 w-fit text-xs font-semibold hover:bg-brand-100 transition"
          >
            <MapPin size={14} /> View live location on map
          </a>
        )}

        {r.status === 'Resolved' && r.outcome && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1">Resolution Outcome</p>
            <p className="text-sm font-semibold text-emerald-800">{r.outcome.category}</p>
            {r.outcome.detail && <p className="text-xs text-emerald-700 mt-1">{r.outcome.detail}</p>}
          </div>
        )}

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        <PendingDirectivesCard referralId={referralId} directives={r.pendingDirectives} onChanged={detailQuery.refetch} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {r.reason && (
              <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Referral Context</h3>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.reason}</p>
              </div>
            )}

            {r.lastVerifiedAt && (
              <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 w-fit text-xs">
                <ShieldCheck size={14} />
                <span className="font-semibold">Last verified: {new Date(r.lastVerifiedAt).toLocaleString()}</span>
              </div>
            )}

            <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-4">Weekly Safety Verification Log</h3>
              {r.notes?.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {r.notes.map((n) => (
                    <div key={n.noteId} className="border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{n.noteText}</p>
                      <p className="text-[10px] text-gray-400 mt-1.5">{n.authorName} - {new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-4">No verifications logged yet.</p>
              )}

              {r.status === 'Open' && (
                <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Verification note (optional - defaults to a standard check-in)..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                  <button
                    onClick={handleVerify}
                    disabled={addNote.loading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
                  >
                    <Send size={13} />
                    {addNote.loading ? 'Logging...' : 'Log Verification'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <DispatchDetailsCard r={r} />
            <ThreatAssessmentCard r={r} onChanged={detailQuery.refetch} />
          </div>
        </div>
      </div>

      {showResolveDialog && (
        <ResolveDialog
          referralId={referralId}
          onCancel={() => setShowResolveDialog(false)}
          onResolved={() => navigate('/protectionofficer')}
        />
      )}
    </StaffLayout>
  );
}
