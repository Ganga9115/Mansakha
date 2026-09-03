import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, Copy } from 'lucide-react';
import StaffLayout from '../layouts/StaffLayout';
import PersonSearchPicker from '../components/PersonSearchPicker';
import { useCaseTypeOptions, useJurisdictionOptions, useRegisterLinkedCase } from '../services/hooks';

const CASE_STAGE_OPTIONS = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];

// Multi-Case-Per-Person Support, first deliverable - search for an existing
// person, then register a brand-new case already linked to them. Trimmed
// deliberately: no name/contact/password fields, since a linked case
// inherits the anchor's identity and gets its own default temp password
// (see createLinkedCase in userProvisioning.js) - this form only collects
// what's actually specific to the NEW case.
export default function LinkCases() {
  // FetchCase.jsx's "Link instead" (shown when an Aadhaar match is found)
  // hands a minimal person object here via router state - {anchorUserId,
  // fullName, cases: [{docketNumber}]} - so the operator lands straight on
  // the case-details form instead of having to search for the same match
  // they just saw. Note this list may only show the ONE case Fetch Case
  // already knew about, not necessarily every case that person has - the
  // link itself still resolves the true anchor correctly either way.
  const { state } = useLocation();
  const [selectedPerson, setSelectedPerson] = useState(state?.matchedPerson || null);
  const [docketNumber, setDocketNumber] = useState('');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [caseStage, setCaseStage] = useState('');
  const [caseBackground, setCaseBackground] = useState('');
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const caseTypesQuery = useCaseTypeOptions();
  const stateQuery = useJurisdictionOptions('state');
  const districtQuery = useJurisdictionOptions('district', stateId);
  const registerLinkedCase = useRegisterLinkedCase();

  const caseTypeOptions = caseTypesQuery.data?.caseTypes || [];
  const stateOptions = stateQuery.data?.jurisdictions || [];
  const districtOptions = districtQuery.data?.jurisdictions || [];

  const resetForm = () => {
    setDocketNumber('');
    setCaseTypeId('');
    setCaseStage('');
    setCaseBackground('');
    setStateId('');
    setDistrictId('');
  };

  const handleChangePerson = () => {
    setSelectedPerson(null);
    setError(null);
    setCreated(null);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (!docketNumber.trim() || !caseTypeId || !districtId) {
      setError('Please fill in all required fields.');
      return;
    }
    try {
      const result = await registerLinkedCase.mutate({
        docketNumber: docketNumber.trim(),
        jurisdictionId: districtId,
        caseTypeId,
        linkToUserId: selectedPerson.anchorUserId,
        ...(caseStage ? { caseStage } : {}),
        ...(caseBackground.trim() ? { caseBackground: caseBackground.trim() } : {}),
      });
      setCreated({
        docketNumber: result?.docketNumber || docketNumber.trim(),
        temporaryPassword: result?.temporaryPassword || 'User123',
      });
      resetForm();
    } catch (err) {
      setError(err.message || 'Could not create this linked case.');
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  if (!selectedPerson) {
    return (
      <StaffLayout title="Link Cases">
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4 max-w-2xl">
          <div>
            <h3 className="font-bold text-sm text-gray-800">Find the person to link a case to</h3>
            <p className="text-xs text-gray-500 mt-1">
              Search by name, docket number, mobile number, or Aadhaar number. If this person already has one or more
              cases, they'll show up here so you can register a new one linked to them.
            </p>
          </div>
          <PersonSearchPicker onSelect={setSelectedPerson} />
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout title="Link Cases">
      <div className="space-y-4 max-w-2xl">
        <button
          type="button"
          onClick={handleChangePerson}
          className="flex items-center gap-2 text-xs font-semibold text-[#519BCE] hover:underline"
        >
          <ArrowLeft size={14} /> Change person
        </button>

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800">
          Registering a new case linked to <span className="font-bold">{selectedPerson.fullName || 'this person'}</span>
          {' '}({selectedPerson.cases.length} existing case{selectedPerson.cases.length === 1 ? '' : 's'}: {selectedPerson.cases.map((c) => c.docketNumber).join(', ')}).
          This new case will share their check-in history and assigned counsellor automatically.
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-gray-800">New Case Details</h3>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Docket Number</label>
            <input
              type="text"
              value={docketNumber}
              onChange={(e) => setDocketNumber(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="e.g. DKT-2026-00456"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">State</label>
              <select
                value={stateId}
                onChange={(e) => { setStateId(e.target.value); setDistrictId(''); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                <option value="">Select...</option>
                {[...stateOptions].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                  <option key={s.jurisdictionId} value={s.jurisdictionId}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">District</label>
              <select
                value={districtId}
                onChange={(e) => setDistrictId(e.target.value)}
                disabled={!stateId}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50"
              >
                <option value="">{stateId ? 'Select...' : 'Select a state first'}</option>
                {[...districtOptions].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                  <option key={d.jurisdictionId} value={d.jurisdictionId}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Case Type</label>
              <select value={caseTypeId} onChange={(e) => setCaseTypeId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="">Select...</option>
                {caseTypeOptions.map((c) => <option key={c.case_type_id} value={c.case_type_id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Case Stage</label>
              <select value={caseStage} onChange={(e) => setCaseStage(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="">Investigation (default)</option>
                {CASE_STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Case Background (optional)</label>
            <textarea
              value={caseBackground}
              onChange={(e) => setCaseBackground(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Brief context for the assigned counsellor - shown on Case Detail"
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          {created && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 space-y-2">
              <p className="text-xs text-emerald-700 font-semibold">Linked case created - hand these to the person:</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-800">Docket Number</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-emerald-900">{created.docketNumber}</span>
                  <button type="button" onClick={() => handleCopy(created.docketNumber)} className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"><Copy size={14} /></button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-800">Password</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-emerald-900">{created.temporaryPassword}</span>
                  <button type="button" onClick={() => handleCopy(created.temporaryPassword)} className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"><Copy size={14} /></button>
                </div>
              </div>
              <p className="text-[11px] text-emerald-700">
                This is a new, separate login for this case - the person will set their own password the first time they
                use it, and it will then become their shared password for every case they have.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={registerLinkedCase.loading}
            className="w-full px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
          >
            {registerLinkedCase.loading ? 'Creating...' : 'Create Linked Case'}
          </button>
        </form>
      </div>
    </StaffLayout>
  );
}
