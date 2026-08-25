import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import StaffLayout from '../../../layouts/StaffLayout';
import { useInterventionTypes, useLogIntervention } from '../../../services/hooks';

export default function LogIntervention() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const victimId = searchParams.get('victimId');
  const suggestedId = searchParams.get('suggested');

  const { data, loading: typesLoading, error: typesError } = useInterventionTypes();
  const logIntervention = useLogIntervention(victimId);

  const [interventionTypeId, setInterventionTypeId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (suggestedId) setInterventionTypeId(suggestedId);
  }, [suggestedId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!interventionTypeId) {
      setError('Select an intervention type.');
      return;
    }
    try {
      await logIntervention.mutate({ interventionTypeId, notes });
      setSubmitted(true);
      setTimeout(() => navigate(`/staff/counsellor/case-detail/${victimId}`), 1200);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!victimId) {
    return (
      <StaffLayout title="Log New Intervention" section="counsellor">
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-3 rounded-lg">
          No case selected - open this from a case's "Log Intervention" button.
        </div>
      </StaffLayout>
    );
  }

  if (submitted) {
    return (
      <StaffLayout title="Log New Intervention" section="counsellor">
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg">
          Intervention logged. Returning to the case...
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout title="Log New Intervention" section="counsellor">
      <div className="space-y-6 max-w-3xl mx-auto">

        <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-sm">
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase block mb-1">Target Case</span>
          <span className="text-base font-bold text-gray-800">{victimId.slice(0, 8)}</span>
        </div>

        <div className="bg-white p-8 rounded-xl border border-gray-200/80 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-6">Intervention Details</h3>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Intervention Type</label>
              {typesError ? (
                <p className="text-xs text-red-600">{typesError}</p>
              ) : (
                <select
                  value={interventionTypeId}
                  onChange={(e) => setInterventionTypeId(e.target.value)}
                  disabled={typesLoading}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#519BCE] focus:border-[#519BCE]"
                >
                  <option value="">{typesLoading ? 'Loading...' : 'Select a type'}</option>
                  {(data?.interventionTypes || []).map((t) => (
                    <option key={t.intervention_type_id} value={t.intervention_type_id}>{t.name}</option>
                  ))}
                </select>
              )}
              {suggestedId && <p className="text-[11px] text-[#519BCE] mt-1">AI-suggested type pre-selected - review before saving.</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes (optional)</label>
              <textarea
                rows={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3.5 bg-white border border-gray-300 rounded-lg text-xs leading-relaxed text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#519BCE] focus:border-[#519BCE] resize-none"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate(`/staff/counsellor/case-detail/${victimId}`)}
                className="px-5 py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={logIntervention.loading}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#519BCE] hover:bg-[#3d83b3] rounded-lg shadow-sm transition disabled:opacity-60"
              >
                {logIntervention.loading ? 'Saving...' : 'Submit Intervention'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </StaffLayout>
  );
}
