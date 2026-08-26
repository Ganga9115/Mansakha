import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { useCaseTypeOptions, useJurisdictionOptions } from '../services/hooks';

const CASE_STAGE_OPTIONS = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];

// Shared by District Admin's VictimRegistration.jsx (jurisdiction locked to
// the admin's own district) and Data Intake Admin's Dashboard.jsx
// (jurisdiction open - not jurisdiction-locked, per the backend prompt's
// non-scoped /api/data-intake/victims route) - same fields either way, only
// whether State/District are editable differs.
export default function VictimRegistrationForm({ lockedJurisdictionId, lockedJurisdictionLabel, onCreate, creating }) {
  const caseTypesQuery = useCaseTypeOptions();
  const stateQuery = useJurisdictionOptions('state');

  const [docketNumber, setDocketNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [caseStage, setCaseStage] = useState('');
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [error, setError] = useState(null);
  const [createdDocket, setCreatedDocket] = useState(null);

  const districtQuery = useJurisdictionOptions('district', lockedJurisdictionId ? undefined : stateId);
  const caseTypeOptions = caseTypesQuery.data?.caseTypes || [];
  const stateOptions = stateQuery.data?.jurisdictions || [];
  const districtOptions = districtQuery.data?.jurisdictions || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setCreatedDocket(null);
    const jurisdictionId = lockedJurisdictionId || districtId;
    if (!docketNumber.trim() || !fullName.trim() || !contactNumber.trim() || !caseTypeId || !caseStage || !jurisdictionId) {
      setError('Please fill in all fields.');
      return;
    }
    try {
      const result = await onCreate({
        docketNumber: docketNumber.trim(),
        fullName: fullName.trim(),
        contactNumber: contactNumber.trim(),
        jurisdictionId,
        caseTypeId,
        caseStage,
      });
      setCreatedDocket(result?.docketNumber || docketNumber.trim());
      setDocketNumber('');
      setFullName('');
      setContactNumber('');
      setCaseTypeId('');
      setCaseStage('');
      setStateId('');
      setDistrictId('');
    } catch (err) {
      setError(err.message || 'Could not create this victim record.');
    }
  };

  const handleCopyDocket = () => {
    if (createdDocket) navigator.clipboard?.writeText(createdDocket).catch(() => {});
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
      <h3 className="font-bold text-sm text-gray-800">Create Victim Credentials</h3>

      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Docket Number</label>
        <input
          type="text"
          value={docketNumber}
          onChange={(e) => setDocketNumber(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="e.g. DKT-2026-00123"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Mobile Number</label>
          <input
            type="text"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="e.g. 9876543210"
          />
        </div>
      </div>

      {lockedJurisdictionId ? (
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction</label>
          <input
            type="text"
            value={lockedJurisdictionLabel || 'Your district'}
            disabled
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
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
      )}

      <div className="grid grid-cols-2 gap-3">
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
            <option value="">Select...</option>
            {CASE_STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {createdDocket && (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <div>
            <p className="text-xs text-emerald-700 font-semibold">Victim created. Docket number:</p>
            <p className="text-sm font-bold text-emerald-900">{createdDocket}</p>
          </div>
          <button type="button" onClick={handleCopyDocket} className="p-2 text-emerald-700 hover:bg-emerald-100 rounded-lg">
            <Copy size={16} />
          </button>
        </div>
      )}

      <button
        type="submit"
        disabled={creating}
        className="w-full px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
      >
        {creating ? 'Creating...' : 'Create Victim'}
      </button>
    </form>
  );
}
