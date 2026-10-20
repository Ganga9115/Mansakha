import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { ArrowLeft, CheckCircle2, XCircle, FileText, User, Phone, Home } from 'lucide-react';
import { useInterventionRequestDetail, useReviewInterventionRequest } from '../services/hooks';

// Same list -> detail convention as ReferralDetail.jsx / ProtectionRegistry.jsx
// - a scannable table on the list page, every action on its own dedicated
// record here. Replaces the old inline-accordion pattern this page used to
// share with district_admin's own copy, which crammed proof documents,
// contact details and the accept/reject decision into an expanding table
// row instead of giving the record its own page.

const STATUS_BADGE = {
  Pending: 'bg-amber-100 text-amber-700',
  Accepted: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-rose-100 text-rose-700',
};

// The victim's name, number and address, so an officer who accepts a
// Relocation or Witness Protection request can actually reach the person
// they have just committed to move. Same disclosure boundary as
// ReferralDetail.jsx's own DispatchDetailsCard: detail view only, and the
// backend audit-logs every read under victim_contact_details.
function ContactDetailsCard({ r }) {
  if (!r.victimName && !r.victimContactNumber && !r.victimAddress) return null;
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <User size={15} className="text-brand-900" />
        <h3 className="font-bold text-sm text-gray-800">Contact Details</h3>
      </div>
      <p className="text-[11px] text-gray-400">
        Shown so you can actually reach this person if you accept. Every view of these details is recorded in the audit log.
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

function ProofDocumentsCard({ documents }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm space-y-3">
      <div className="flex items-center gap-1.5">
        <FileText size={15} className="text-brand-900" />
        <h3 className="font-bold text-sm text-gray-800">Proof Documents</h3>
      </div>
      {documents?.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {documents.map((d, i) => (
            d.signedUrl ? (
              <a key={i} href={d.signedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition text-xs text-gray-700">
                <FileText size={13} /> {d.documentLabel}
              </a>
            ) : (
              <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-400 rounded-md text-xs">
                <FileText size={13} /> {d.documentLabel} (unavailable)
              </span>
            )
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No documents attached.</p>
      )}
    </div>
  );
}

export default function InterventionRequestDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const detailQuery = useInterventionRequestDetail(requestId);
  const review = useReviewInterventionRequest();
  const [showRejectReason, setShowRejectReason] = useState(false);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState(null);

  usePageHeader({ title: 'Intervention Request' });

  const r = detailQuery.data;

  if (detailQuery.loading) {
    return <p className="text-sm text-gray-400">Loading...</p>;
  }
  if (detailQuery.error || !r) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">
        {detailQuery.error || 'This request could not be located.'}
      </div>
    );
  }

  const handleAccept = async () => {
    setActionError(null);
    try {
      await review.mutate(r.requestId, 'Accepted');
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not accept this request.');
    }
  };

  const handleRejectConfirm = async () => {
    if (!reason.trim()) return;
    setActionError(null);
    try {
      await review.mutate(r.requestId, 'Rejected', reason.trim());
      detailQuery.refetch();
    } catch (err) {
      setActionError(err.message || 'Could not reject this request.');
    }
  };

  return (
    <>
      <div className="space-y-6">
        <button onClick={() => navigate('/protectionofficer/intervention-requests')} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft size={14} /> Back to Intervention Requests
        </button>

        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-10 flex-wrap">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Docket Number</span>
              <span className="text-base font-bold text-gray-800">{r.docketNumber}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Intervention Type</span>
              <span className="text-xs font-bold text-gray-700">{r.interventionTypeName}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Case Type</span>
              <span className="text-xs font-bold text-gray-700">{r.caseTypeName}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Status</span>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block">Requested On</span>
              <span className="text-xs font-bold text-gray-700">{new Date(r.requestedAt).toLocaleString()}</span>
            </div>
          </div>

          {r.status === 'Pending' && !showRejectReason && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleAccept}
                disabled={review.loading}
                className="flex items-center gap-1.5 px-4 py-2 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold transition disabled:opacity-60"
              >
                <CheckCircle2 size={14} />
                {review.loading ? 'Working...' : 'Accept'}
              </button>
              <button
                onClick={() => setShowRejectReason(true)}
                className="flex items-center gap-1.5 px-4 py-2 border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold transition"
              >
                <XCircle size={14} />
                Reject
              </button>
            </div>
          )}
        </div>

        {showRejectReason && (
          <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm flex items-center gap-2">
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
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition disabled:opacity-60 shrink-0"
            >
              {review.loading ? 'Working...' : 'Confirm Reject'}
            </button>
            <button onClick={() => { setShowRejectReason(false); setReason(''); }} className="px-3 py-2 text-gray-500 text-xs shrink-0">
              Cancel
            </button>
          </div>
        )}

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg">{actionError}</div>}

        {r.status === 'Rejected' && r.decisionReason && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">
            <p className="text-xs font-bold text-rose-700 uppercase tracking-wide mb-1">Rejection Reason</p>
            <p className="text-sm text-rose-700">{r.decisionReason}</p>
          </div>
        )}

        {r.status === 'Accepted' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <p className="text-sm font-semibold text-emerald-800">Accepted - a referral has been created in your Protection Registry for follow-up.</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {r.description && (
              <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Victim's Description</h3>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.description}</p>
              </div>
            )}
            <ProofDocumentsCard documents={r.documents} />
          </div>

          <div className="space-y-6">
            <ContactDetailsCard r={r} />
          </div>
        </div>
      </div>
    </>
  );
}
