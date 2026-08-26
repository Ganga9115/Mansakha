import React, { useState } from 'react';
import StaffLayout from '../../layouts/StaffLayout';
import { Search, AlertTriangle } from 'lucide-react';
import { useFetchCaseDetails } from '../../services/hooks';

// The NHAA/Integrated Portal lookup is explicitly simulated on the backend
// today (no real government API integration exists yet) - the "Simulated
// data" banner below is load-bearing, not decorative: this result must
// never be mistaken for a live API response.
export default function FetchCase() {
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
    <StaffLayout title="Fetch Case Details" section="dataintake">
      <div className="max-w-xl space-y-4">
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
              <div className="flex justify-between"><span className="text-gray-500">Docket Number</span><span className="font-semibold text-gray-800">{result.docketNumber}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Full Name</span><span className="font-semibold text-gray-800">{result.fullName}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Case Type</span><span className="font-semibold text-gray-800">{result.caseType}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Jurisdiction</span><span className="font-semibold text-gray-800">{result.jurisdictionName}</span></div>
            </div>
          </div>
        )}
      </div>
    </StaffLayout>
  );
}
