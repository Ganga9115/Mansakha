import React, { useState } from 'react';
import StaffLayout from '../../../layouts/StaffLayout';
import { Search } from 'lucide-react';
import VictimRegistrationForm from '../../../components/VictimRegistrationForm';
import { useMyJurisdiction, useCreateVictim, useSearchVictimByDocket, useUpdateVictim } from '../../../services/hooks';

const CASE_STAGE_OPTIONS = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];

// District Admin only - Feature Catalog's Victim Credential Management.
// State/National Administration don't get this page (no nav item for
// them); a District Admin's own State/District are locked to their own
// jurisdiction, not chosen, since this is *their* district's intake.
export default function VictimRegistration() {
  const { jurisdictionId } = useMyJurisdiction();
  const createVictim = useCreateVictim();
  const searchVictim = useSearchVictimByDocket();
  const updateVictim = useUpdateVictim();

  const [searchDocket, setSearchDocket] = useState('');
  const [searchError, setSearchError] = useState(null);
  const [editVictim, setEditVictim] = useState(null);
  const [editCaseStage, setEditCaseStage] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setSearchError(null);
    setEditVictim(null);
    setEditSuccess(false);
    if (!searchDocket.trim()) return;
    try {
      const result = await searchVictim.mutate(searchDocket.trim());
      const victim = result?.victim;
      if (!victim) {
        setSearchError('No victim found with that docket number.');
        return;
      }
      setEditVictim(victim);
      setEditCaseStage(victim.caseStage || '');
    } catch (err) {
      setSearchError(err.message || 'Search failed.');
    }
  };

  const handleSaveEdit = async () => {
    if (!editVictim) return;
    setEditSuccess(false);
    try {
      await updateVictim.mutate(editVictim.victimId, { caseStage: editCaseStage });
      setEditSuccess(true);
    } catch (err) {
      setSearchError(err.message || 'Could not save changes.');
    }
  };

  return (
    <StaffLayout title="Victim Registration" section="districtadmin">
      <div className="grid grid-cols-2 gap-6">
        <VictimRegistrationForm
          lockedJurisdictionId={jurisdictionId}
          lockedJurisdictionLabel="Your district"
          onCreate={createVictim.mutate}
          creating={createVictim.loading}
        />

        {/* EDIT */}
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-gray-800">Edit Victim Record</h3>

          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchDocket}
              onChange={(e) => setSearchDocket(e.target.value)}
              placeholder="Search by docket number..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="submit"
              disabled={searchVictim.loading}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-60"
            >
              <Search size={16} />
            </button>
          </form>

          {searchError && <p className="text-xs text-rose-600">{searchError}</p>}

          {editVictim && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase block">Full Name</span>
                <span className="text-sm font-semibold text-gray-800">{editVictim.fullName}</span>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Case Stage</label>
                <select
                  value={editCaseStage}
                  onChange={(e) => setEditCaseStage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  {CASE_STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {editSuccess && <p className="text-xs text-emerald-600">Saved.</p>}
              <button
                onClick={handleSaveEdit}
                disabled={updateVictim.loading}
                className="w-full px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
              >
                {updateVictim.loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </StaffLayout>
  );
}
