import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useGenerateReport } from '../services/hooks';

// National Admin's own "Generate Report" modal - a state-wise report (each
// child state's rollup, side by side, see ReportSnapshotView's `states`
// table) submitted to Ministry (required, added server-side - never sent by
// this form). National has no jurisdiction parent - Ministry itself IS
// National's "primary recipient" - so there is nothing optional to add
// here: no checkboxes at all, just the one informational locked row.

const PERIOD_TYPES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'custom', label: 'Custom' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function GenerateReportModal({ jurisdictionId, onClose, onGenerated }) {
  const now = new Date();

  const [periodType, setPeriodType] = useState('monthly');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [week, setWeek] = useState(1);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [commentary, setCommentary] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(null); // null | 'draft' | 'submit'

  const generateReport = useGenerateReport();

  const periodValid = (() => {
    if (periodType === 'monthly') return Boolean(month) && Boolean(year);
    if (periodType === 'quarterly') return Boolean(quarter) && Boolean(year);
    if (periodType === 'weekly') return Boolean(week) && Boolean(year);
    if (periodType === 'custom') return Boolean(customStart && customEnd && customEnd >= customStart);
    return false;
  })();

  const buildPayload = (asDraft) => {
    const payload = {
      jurisdictionId,
      periodType,
      commentary: commentary.trim() || undefined,
      asDraft,
    };
    if (periodType === 'monthly') { payload.month = Number(month); payload.year = Number(year); }
    if (periodType === 'quarterly') { payload.quarter = Number(quarter); payload.year = Number(year); }
    if (periodType === 'weekly') { payload.week = Number(week); payload.year = Number(year); }
    if (periodType === 'custom') { payload.customStart = customStart; payload.customEnd = customEnd; }
    // National never sends a `recipients` array - there is no valid
    // optional target above it, Ministry is always the primary recipient
    // added server-side.
    return payload;
  };

  const handleSubmit = async (asDraft) => {
    if (!periodValid) {
      setSubmitError('Please complete the period selection above.');
      return;
    }
    setSubmitError(null);
    setSubmitting(asDraft ? 'draft' : 'submit');
    try {
      await generateReport.mutate(buildPayload(asDraft));
      onGenerated?.();
      onClose?.();
    } catch (err) {
      setSubmitError(err.message || 'Could not generate report.');
    } finally {
      setSubmitting(null);
    }
  };

  const isBusy = submitting !== null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-bold text-sm text-gray-800">Generate State-Wise Report</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Period Type */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-2">Period</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {PERIOD_TYPES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriodType(p.value)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                    periodType === p.value
                      ? 'bg-brand-700/15 text-brand-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {periodType === 'monthly' && (
              <div className="grid grid-cols-2 gap-3">
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Year" />
              </div>
            )}

            {periodType === 'quarterly' && (
              <div className="grid grid-cols-2 gap-3">
                <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
                </select>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Year" />
              </div>
            )}

            {periodType === 'weekly' && (
              <div className="grid grid-cols-2 gap-3">
                <input type="number" min={1} max={53} value={week} onChange={(e) => setWeek(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="ISO Week (1-53)" />
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Year" />
              </div>
            )}

            {periodType === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 text-gray-600 font-semibold">
                  From
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd || undefined}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-gray-600 font-semibold">
                  To
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart || undefined}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700"
                  />
                </label>
                {customStart && customEnd && customEnd < customStart && (
                  <span className="text-rose-600 font-semibold">End date can't be before start date.</span>
                )}
              </div>
            )}
          </div>

          {/* Share With - National has nothing optional to add, just the
              one informational locked row. */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-2">Share With</label>
            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked disabled className="w-4 h-4 accent-brand-400 opacity-70" />
                <span className="text-xs font-semibold text-gray-600">Ministry (Primary Recipient)</span>
              </div>
              <span className="text-[10px] font-bold text-brand-900 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full shrink-0">Required</span>
            </div>
          </div>

          {/* Commentary */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Commentary (optional)</label>
            <textarea
              value={commentary}
              onChange={(e) => setCommentary(e.target.value)}
              rows={4}
              placeholder="Notes for the receiving tier - context, concerns, recommended actions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {submitError && <p className="text-xs text-rose-600">{submitError}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-semibold transition">
              Cancel
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleSubmit(true)}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-semibold transition disabled:opacity-60"
            >
              {submitting === 'draft' ? 'Saving...' : 'Save as Draft'}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleSubmit(false)}
              className="px-4 py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
            >
              {submitting === 'submit' ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
