import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { useCaseTypeOptions, useJurisdictionOptions, usePoliceStationOptions } from '../services/hooks';

// Data Operator's own copy - NOT jurisdiction-locked (State/District are
// open dropdowns, unlike District Admin's own copy of this form).
// migration_034: Case Stage is no longer collected here (or anywhere on the
// Data Operator side) - a newly created case is always auto-set to
// Investigation by the backend, and every subsequent stage change comes
// exclusively from the simulated eCourt sync worker
// (core/services/ecourtStageSync.js). Data Operator has no path, at
// creation or afterward, to set/advance/downgrade a case's stage.
// `initialValues` - optional, from FetchCase.jsx's "Use These Details" -
// pre-fills every field from a simulated fetch result so it can be
// reviewed/edited before submitting, rather than retyped from scratch.
export default function UserRegistrationForm({ onCreate, creating, initialValues }) {
  const caseTypesQuery = useCaseTypeOptions();
  const stateQuery = useJurisdictionOptions('state');

  const [docketNumber, setDocketNumber] = useState(initialValues?.docketNumber || '');
  const [fullName, setFullName] = useState(initialValues?.suggestedFullName || '');
  const [contactNumber, setContactNumber] = useState(initialValues?.suggestedContactNumber || '');
  const [password, setPassword] = useState('');
  const [caseTypeId, setCaseTypeId] = useState(initialValues?.suggestedCaseTypeId || '');
  const [caseBackground, setCaseBackground] = useState(initialValues?.suggestedCaseBackground || '');
  const [aadhaarNumber, setAadhaarNumber] = useState(initialValues?.suggestedAadhaarNumber || '');
  // Residential address, transcribed from the FIR like every other field on
  // this form. The victim is never asked for it in the mobile app - there is
  // no profile-edit screen there - so intake is the only point at which it
  // can legitimately enter the system, and an FIR always records the
  // complainant's full address. Without it, the Protection Officer dispatched
  // to relocate someone has a district and nothing else.
  const [address, setAddress] = useState(initialValues?.suggestedAddress || '');
  const [stateId, setStateId] = useState(initialValues?.suggestedStateId || '');
  const [districtId, setDistrictId] = useState(initialValues?.suggestedDistrictId || '');
  const [stationId, setStationId] = useState('');
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const districtQuery = useJurisdictionOptions('district', stateId);
  const stationQuery = usePoliceStationOptions(districtId);
  const caseTypeOptions = caseTypesQuery.data?.caseTypes || [];
  const stateOptions = stateQuery.data?.jurisdictions || [];
  const districtOptions = districtQuery.data?.jurisdictions || [];
  const stationOptions = stationQuery.data?.stations || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (!docketNumber.trim() || !fullName.trim() || !contactNumber.trim() || !caseTypeId || !districtId) {
      setError('Please fill in all required fields.');
      return;
    }
    try {
      const result = await onCreate({
        docketNumber: docketNumber.trim(),
        fullName: fullName.trim(),
        contactNumber: contactNumber.trim(),
        password: password.trim() || undefined,
        jurisdictionId: districtId,
        caseTypeId,
        ...(stationId ? { stationId } : {}),
        ...(caseBackground.trim() ? { caseBackground: caseBackground.trim() } : {}),
        ...(aadhaarNumber.trim() ? { aadhaarNumber: aadhaarNumber.trim() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
      });
      setCreated({
        docketNumber: result?.docketNumber || docketNumber.trim(),
        temporaryPassword: result?.temporaryPassword || password.trim() || 'User123',
      });
      setDocketNumber('');
      setFullName('');
      setContactNumber('');
      setPassword('');
      setCaseTypeId('');
      setCaseBackground('');
      setAadhaarNumber('');
      setAddress('');
      setStateId('');
      setDistrictId('');
      setStationId('');
    } catch (err) {
      setError(err.message || 'Could not create this user record.');
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
      <h3 className="font-bold text-sm text-gray-800">Create User Credentials</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Mobile Number</label>
          <input
            type="text"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value.replace(/[^0-9]/g, ''))}
            maxLength={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="e.g. 9876543210"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Password</label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="e.g. User123 (leave blank for default)"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Aadhaar Number (optional)</label>
        <input
          type="text"
          value={aadhaarNumber}
          onChange={(e) => setAadhaarNumber(e.target.value.replace(/[^0-9]/g, ''))}
          maxLength={12}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="12-digit Aadhaar number"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          Used to recognize if this person already has another case - if it matches an existing case, use Link Cases
          instead of registering a new one here.
        </p>
      </div>

      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Residential Address (optional)</label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="As recorded in the FIR"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          Transcribed from the FIR. Shared only with the Protection Officer if this case is later referred to
          them for Relocation or Witness Protection - never shown to any other role.
        </p>
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
            onChange={(e) => { setDistrictId(e.target.value); setStationId(''); }}
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

      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Police Station (FIR registered at)</label>
        <select
          value={stationId}
          onChange={(e) => setStationId(e.target.value)}
          disabled={!districtId}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50"
        >
          <option value="">{districtId ? (stationOptions.length ? 'Select...' : 'No stations set up for this district yet') : 'Select a district first'}</option>
          {stationOptions.map((s) => <option key={s.stationId} value={s.stationId}>{s.name}</option>)}
        </select>
        <p className="text-[10px] text-gray-400 mt-1">
          Assigns this case to that station's Investigating Officer(s). Can be left unassigned for now and set later.
        </p>
      </div>

      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Case Type</label>
        <select value={caseTypeId} onChange={(e) => setCaseTypeId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">Select...</option>
          {caseTypeOptions.map((c) => <option key={c.case_type_id} value={c.case_type_id}>{c.name}</option>)}
        </select>
        <p className="text-[10px] text-gray-400 mt-1">
          Case Stage always starts at Investigation and is updated exclusively by the eCourt system as the
          case progresses - it cannot be set here.
        </p>
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
          <p className="text-xs text-emerald-700 font-semibold">User created - hand these to them:</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-800">Docket Number</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-emerald-900">{created.docketNumber}</span>
              <button type="button" onClick={() => handleCopy(created.docketNumber)} className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"><Copy size={14} /></button>
            </div>
          </div>
          {created.temporaryPassword && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-800">Password</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-900">{created.temporaryPassword}</span>
                <button type="button" onClick={() => handleCopy(created.temporaryPassword)} className="p-1 text-emerald-700 hover:bg-emerald-100 rounded"><Copy size={14} /></button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-emerald-700">The user will be asked to set their own password the first time they log in.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={creating}
        className="w-full px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
      >
        {creating ? 'Creating...' : 'Create User'}
      </button>
    </form>
  );
}
