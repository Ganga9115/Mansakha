import React, { useState } from 'react';
import StaffLayout from '../layouts/StaffLayout';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { useInterventionRequestsList, useInterventionRequestDetail, useReviewInterventionRequest } from '../services/hooks';

// DLSA's own proof-verified review queue for Legal Aid Request Assistance
// submissions - District Admin no longer decides on these (see
// interventionRequestReview.js). Adapted from
// district_admin/pages/InterventionRequests.jsx (the structural template),
// minus jurisdiction gating (this queue isn't jurisdiction-scoped, same as
// DLSA's own referral queue). Accepting here creates a real agency_referral
// straight into the Legal Aid Queue, carrying the verified proof forward.

const STATUS_BADGE = {
  Pending: 'bg-amber-100 text-amber-700',
  Accepted: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
};

function RequestRow({ r, onDecided }) {
  const [expanded, setExpanded] = useState(false);
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState(null);
  const detailQuery = useInterventionRequestDetail(expanded ? r.requestId : null);
  const review = useReviewInterventionRequest();

  const handleAccept = async (e) => {
    e.stopPropagation();
    setActionError(null);
    try {
      await review.mutate(r.requestId, 'Accepted');
      onDecided();
    } catch (err) {
      setActionError(err.message || 'Could not accept this request.');
    }
  };

  const handleRejectConfirm = async (e) => {
    e.stopPropagation();
    if (!reason.trim()) return;
    setActionError(null);
    try {
      await review.mutate(r.requestId, 'Rejected', reason.trim());
      onDecided();
    } catch (err) {
      setActionError(err.message || 'Could not reject this request.');
    }
  };

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/70 transition gap-3"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800">{r.docketNumber}</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
            <span className="text-[10px] text-gray-400">{r.interventionTypeName}</span>
          </div>
          <p className="text-xs text-gray-500">{r.caseTypeName} - requested {new Date(r.requestedAt).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {r.status === 'Pending' && !showRejectReason && (
            <>
              <span
                role="button"
                tabIndex={0}
                onClick={handleAccept}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-md text-[11px] font-semibold transition"
              >
                <CheckCircle2 size={13} />
                {review.loading ? 'Working...' : 'Accept'}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setShowRejectReason(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-md text-[11px] font-semibold transition"
              >
                <XCircle size={13} />
                Reject
              </span>
            </>
          )}
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>

      {showRejectReason && (
        <div onClick={(e) => e.stopPropagation()} className="px-6 pb-4 -mt-2 flex items-center gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs"
          />
          <button
            onClick={handleRejectConfirm}
            disabled={!reason.trim() || review.loading}
            className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
          >
            {review.loading ? 'Working...' : 'Confirm Reject'}
          </button>
          <button onClick={() => { setShowRejectReason(false); setReason(''); }} className="px-3 py-2 text-gray-500 text-xs">
            Cancel
          </button>
        </div>
      )}

      {actionError && <div className="mx-6 mb-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-2 rounded-lg">{actionError}</div>}

      {expanded && (
        <div className="px-6 pb-5 text-xs text-gray-600 space-y-3">
          {r.description && (
            <div className="bg-[#EBF4FA]/60 border border-[#D6E8F5] rounded-lg p-3">
              <p className="font-bold text-[#3D5A80] text-[11px] uppercase mb-1">Victim's Description</p>
              <p className="whitespace-pre-wrap">{r.description}</p>
            </div>
          )}
          {r.status === 'Rejected' && r.decisionReason && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
              <p className="font-bold text-rose-700 text-[11px] uppercase mb-1">Rejection Reason</p>
              <p>{r.decisionReason}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">Proof Documents</p>
            {detailQuery.loading ? (
              <p className="text-gray-400">Loading documents...</p>
            ) : detailQuery.data?.documents?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {detailQuery.data.documents.map((d, i) => (
                  d.signedUrl ? (
                    <a key={i} href={d.signedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition">
                      <FileText size={13} /> {d.documentLabel}
                    </a>
                  ) : (
                    <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-400 rounded-md">
                      <FileText size={13} /> {d.documentLabel} (unavailable)
                    </span>
                  )
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No documents attached.</p>
            )}
          </div>
          {r.status === 'Accepted' && (
            <p className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              Accepted - a referral has been created in your Legal Aid Queue for follow-up.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function InterventionRequests() {
  const [tab, setTab] = useState('Pending');
  const query = useInterventionRequestsList(tab);
  const requests = query.data?.requests || [];

  return (
    <StaffLayout title="Intervention Requests">
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-gray-800">Intervention Requests</h3>
            <p className="text-[11px] text-gray-400">Victims request Legal Aid with proof documents (caste certificate, FIR copy, photo ID). Review and decide here - accepting creates a referral in your own Legal Aid Queue.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {['Pending', 'Accepted', 'Rejected'].map((s) => (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  tab === s ? 'bg-[#519BCE] text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="border border-gray-200/80 rounded-xl overflow-hidden">
            {query.loading ? (
              <p className="text-sm text-gray-400 p-6">Loading...</p>
            ) : query.error ? (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 m-4 rounded-lg">{query.error}</div>
            ) : requests.length === 0 ? (
              <p className="text-sm text-gray-400 p-6">No {tab.toLowerCase()} requests.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {requests.map((r) => (
                  <RequestRow key={r.requestId} r={r} onDecided={query.refetch} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </StaffLayout>
  );
}
