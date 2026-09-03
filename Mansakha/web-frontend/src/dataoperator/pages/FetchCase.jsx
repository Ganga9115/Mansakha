import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffLayout from '../layouts/StaffLayout';
import { Search, AlertTriangle, ArrowRight } from 'lucide-react';
import { useFetchCaseDetails } from '../services/hooks';

// The NHAA/Integrated Portal lookup is explicitly simulated on the backend
// today (no real government API integration exists yet) - the "Simulated
// data" banner below is load-bearing, not decorative: this result must
// never be mistaken for a live API response. Per explicit request, the
// fixture now returns every field Register User needs (name, contact, case
// type, stage, state/district, background) so a fetched result can be
// reviewed and carried straight into that form via "Use These Details",
// rather than just showing two fields with nowhere to go.
export default function FetchCase() {
  const navigate = useNavigate();
  const [docketNumber, setDocketNumber] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const fetchCase = useFetchCaseDetails();

  const handleSearch = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!docketNumber.trim()) return;
    try {
      const data = await fetchCase.mutate(docketNumber.trim());
      setResult(data);
    } catch (err) {
      setError(err.message || 'Could not fetch case details.');
    }
  };

  return (
    <StaffLayout title="Fetch Case Details">
      <div className="space-y-4">
        <form onSubmit={handleSearch} className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm flex gap-2">
          <input
            type="text"
            value={docketNumber}
            onChange={(e) => setDocketNumber(e.target.value)}
            placeholder="Enter docket number..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            type="submit"
            disabled={fetchCase.loading}
            className="flex items-center gap-2 px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
          >
            <Search size={14} />
            {fetchCase.loading ? 'Fetching...' : 'Fetch'}
          </button>
        </form>

        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

        {result && (
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs font-bold text-amber-800">
              <AlertTriangle size={14} />
              Simulated data - not a live government API response
            </div>
            <div className="p-6 space-y-3 text-sm">
              {result.existingMatch && (
                // Multi-Case-Per-Person Support - the Aadhaar this fetch
                // generated already belongs to a different, existing case.
                // Surfaced immediately, before the operator ever reaches
                // Register User (which would otherwise 409 on the same
                // constraint only after they'd filled in the whole form).
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-blue-800">
                    This Aadhaar matches an existing case - <span className="font-bold">Docket {result.existingMatch.docketNumber}</span>,{' '}
                    <span className="font-bold">{result.existingMatch.fullName}</span>. This may be the same person filing
                    another case.
                  </p>
                  <button
                    onClick={() => navigate('/dataoperator/link-cases', {
                      state: {
                        matchedPerson: {
                          anchorUserId: result.existingMatch.userId,
                          fullName: result.existingMatch.fullName,
                          cases: [{ docketNumber: result.existingMatch.docketNumber }],
                        },
                      },
                    })}
                    className="shrink-0 px-3 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold transition"
                  >
                    Link instead
                  </button>
                </div>
              )}

              <div className="flex justify-between"><span className="text-gray-500">Docket Number</span><span className="font-semibold text-gray-800">{result.docketNumber}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Full Name</span><span className="font-semibold text-gray-800">{result.suggestedFullName}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Mobile Number</span><span className="font-semibold text-gray-800">{result.suggestedContactNumber}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Aadhaar Number</span><span className="font-semibold text-gray-800">{result.suggestedAadhaarNumber}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Case Type</span><span className="font-semibold text-gray-800">{result.suggestedCaseType}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Case Stage</span><span className="font-semibold text-gray-800">{result.suggestedCaseStage}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Jurisdiction</span><span className="font-semibold text-gray-800">{result.suggestedDistrictName}, {result.suggestedStateName}</span></div>
              <div>
                <span className="text-gray-500 block mb-1">Case Background</span>
                <p className="text-gray-700 bg-gray-50 rounded-lg p-3 text-xs">{result.suggestedCaseBackground}</p>
              </div>
              {result.note && <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">{result.note}</p>}

              <button
                onClick={() => navigate('/dataoperator', { state: { prefill: result } })}
                className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition"
              >
                Use These Details <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </StaffLayout>
  );
}
