import React, { useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { useSearchPerson } from '../services/hooks';

// Multi-Case-Per-Person Support - shared by LinkCases.jsx (register a new
// case already linked to a found person) and Users.jsx's "Link to existing
// person" row action (link an already-registered case to a found person).
// Search by name/docket/contact/Aadhaar, unfiltered by which staff role
// registered the match - see GET /api/dataoperator/search-person.
export default function PersonSearchPicker({ onSelect, excludeUserId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const search = useSearchPerson();

  const handleSearch = async (e) => {
    e.preventDefault();
    setError(null);
    if (query.trim().length < 2) {
      setError('Type at least 2 characters to search.');
      return;
    }
    try {
      const data = await search.mutate(query.trim());
      setResults(data.people || []);
    } catch (err) {
      setError(err.message || 'Search failed.');
    }
  };

  // A person is excluded from the results entirely if their ONLY case is the
  // one the caller is already looking at (excludeUserId) - picking "link to
  // myself" would be a self-link, which the backend already rejects, but
  // filtering it here is a clearer UX than letting the operator pick it and
  // then showing them a 409.
  const people = (results || []).filter((p) => !(excludeUserId && p.cases.length === 1 && p.cases[0].userId === excludeUserId));

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="relative flex items-center w-full">
        <div className="absolute left-4 text-gray-400">
          <Search size={18} />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, docket, mobile, or Aadhaar..."
          className="w-full pl-11 pr-32 py-3.5 border border-gray-200 hover:border-gray-300 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-4 focus:ring-[#519BCE]/10 focus:border-[#519BCE] transition-all"
        />
        <button
          type="submit"
          disabled={search.loading}
          className="absolute right-2 top-2 bottom-2 flex items-center gap-2 px-6 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60 shadow-sm"
        >
          <Search size={14} />
          {search.loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {results && (
        people.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">No matching person found.</p>
        ) : (
          <div className="space-y-2">
            {people.map((p) => (
              <button
                key={p.anchorUserId}
                type="button"
                onClick={() => onSelect(p)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-left"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">{p.fullName || 'Unnamed'}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {p.contactNumber || 'No contact'} · {p.cases.length} case{p.cases.length === 1 ? '' : 's'} ({p.cases.map((c) => c.docketNumber).join(', ')})
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
