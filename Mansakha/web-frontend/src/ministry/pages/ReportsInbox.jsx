import React, { useMemo, useState } from 'react';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { ChevronDown, ChevronUp, FilePlus, CheckCircle2, Download } from 'lucide-react';
import { useReportsInbox, useUpdateReportStatus, useDownloadReportPdf } from '../services/hooks';
import ReportBuilder from '../components/ReportBuilder';
import ReportSnapshotView from '../components/ReportSnapshotView';

const STATUS_BADGE = {
  Draft: 'bg-gray-100 text-gray-600',
  Submitted: 'bg-amber-100 text-amber-700',
  Reviewed: 'bg-emerald-100 text-emerald-700',
};

// Ministry's inbox can hold District-, State-, AND National-tier reports at
// once (direct cc at generation, or forwarded later by any recipient) -
// grouping by origin tier, not one flat list, is what makes that legible.
const TIER_GROUP_LABELS = {
  district: 'From Districts (Direct)',
  state: 'From States (Direct)',
  national: 'From National',
};
const TIER_GROUP_ORDER = ['national', 'state', 'district'];

function ReportRow({ r, showReviewAction, onMarkReviewed, markingId, onDownload, downloadingId }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/70 transition"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800">{r.jurisdictionName || r.jurisdictionId}</p>
            {r.status && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>
            )}
            {r.periodLabel && <span className="text-[10px] text-gray-400">{r.periodLabel}</span>}
          </div>
          <p className="text-xs text-gray-500">
            Submitted by {r.generatedByName || 'Unknown'} - {new Date(r.generatedAt).toLocaleString()}
            {r.isForwarded && r.forwardedByName && (
              <span className="ml-1.5 text-brand-900 font-semibold">- Forwarded by {r.forwardedByName}{r.forwardedAt ? ` on ${new Date(r.forwardedAt).toLocaleDateString()}` : ''}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onDownload(r.reportId, r.jurisdictionName || 'report'); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onDownload(r.reportId, r.jurisdictionName || 'report'); } }}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-md text-[11px] font-semibold transition"
          >
            <Download size={13} />
            {downloadingId === r.reportId ? 'Downloading...' : 'PDF'}
          </span>
          {showReviewAction && r.status !== 'Reviewed' && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onMarkReviewed(r.reportId); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onMarkReviewed(r.reportId); } }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-md text-[11px] font-semibold transition"
            >
              <CheckCircle2 size={13} />
              {markingId === r.reportId ? 'Marking...' : 'Mark as Reviewed'}
            </span>
          )}
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-6 pb-4 text-xs text-gray-600 space-y-3">
          {r.commentary && (
            <div className="bg-brand-50/60 border border-brand-100 rounded-lg p-3">
              <p className="font-bold text-brand-900 text-[11px] uppercase mb-1">Commentary</p>
              <p className="whitespace-pre-wrap">{r.commentary}</p>
            </div>
          )}
          <ReportSnapshotView snapshot={r.snapshot} />
        </div>
      )}
    </div>
  );
}

// GET /api/ministry/reports is scoped server-side to exactly Ministry's
// real inbox (a report_recipients row with recipient_type='ministry' and
// status in Submitted/Reviewed) - trust the backend's own filtering
// entirely, no client-side re-filter.
//
// This used to also have an Outbox tab (reports Ministry itself generated
// via the builder below) - removed. It was a best-effort, known-broken
// view: Ministry generating a report makes it the SENDER, not a
// "recipient", so GET /api/ministry/reports never actually returned those
// reports, and the Outbox tab silently showed nothing for most of what
// Ministry sent. "New Report" below still generates a real report for
// whichever jurisdiction Ministry chooses - only the (broken) view of
// Ministry's own sent reports was removed, not the ability to send one.
export default function ReportsInbox() {
  usePageHeader({ title: 'Reports Inbox' });
  const { data, loading, error, refetch } = useReportsInbox();
  const updateStatus = useUpdateReportStatus();
  const downloadPdf = useDownloadReportPdf();

  const [showBuilder, setShowBuilder] = useState(false);
  const [markingId, setMarkingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Everything this endpoint returns IS the inbox (server-side
  // recipient-based filtering already applied).
  const inboxReports = data?.reports || [];

  const groupedInbox = useMemo(() => {
    const byTier = new Map();
    for (const r of inboxReports) {
      const level = r.jurisdictionLevel || 'national';
      if (!byTier.has(level)) byTier.set(level, []);
      byTier.get(level).push(r);
    }
    return TIER_GROUP_ORDER
      .filter((level) => byTier.has(level))
      .map((level) => ({ level, label: TIER_GROUP_LABELS[level] || level, reports: byTier.get(level) }));
  }, [inboxReports]);

  const handleMarkReviewed = async (reportId) => {
    setActionError(null);
    setMarkingId(reportId);
    try {
      await updateStatus.mutate(reportId, 'Reviewed');
      refetch();
    } catch (err) {
      setActionError(err.message || 'Could not update report status.');
    } finally {
      setMarkingId(null);
    }
  };

  const handleDownloadPdf = async (reportId, name) => {
    setActionError(null);
    setDownloadingId(reportId);
    try {
      await downloadPdf.mutate(reportId, name);
    } catch (err) {
      setActionError(err.message || 'Could not download PDF.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-800">
            Inbox {inboxReports.length > 0 ? `(${inboxReports.length})` : ''}
          </h3>

          <button
            onClick={() => setShowBuilder(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-900 hover:bg-brand-900 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <FilePlus size={14} />
            New Report
          </button>
        </div>

        {actionError && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{actionError}</div>}

        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          {loading ? (
            <p className="text-sm text-gray-400 p-6">Loading...</p>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 m-6 rounded-lg">{error}</div>
          ) : inboxReports.length === 0 ? (
            <p className="text-sm text-gray-400 p-6">No reports received yet.</p>
          ) : (
            <div className="divide-y divide-gray-200">
              {groupedInbox.map((group) => (
                <div key={group.level}>
                  <p className="px-6 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50/60">{group.label}</p>
                  <div className="divide-y divide-gray-100">
                    {group.reports.map((r) => (
                      <ReportRow
                        key={r.reportId}
                        r={r}
                        showReviewAction
                        onMarkReviewed={handleMarkReviewed}
                        markingId={markingId}
                        onDownload={handleDownloadPdf}
                        downloadingId={downloadingId}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showBuilder && (
        <ReportBuilder
          onClose={() => setShowBuilder(false)}
          onSubmitted={refetch}
        />
      )}
    </>
  );
}
