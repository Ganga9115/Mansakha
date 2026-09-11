import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { useCaseTypeOptions, useJurisdictionOptions } from '../services/hooks';

// District Admin's own copy - jurisdiction locked to the admin's own
// district, and Case Stage is never collected here (per explicit request:
// stage is set later via the Users list's editable dropdown, not decided at
// intake time) - unlike Data Operator's own copy of this form, which does
// collect it.
export default function UserRegistrationForm({ lockedJurisdictionId, lockedJurisdictionLabel, onCreate, creating }) {
  const caseTypesQuery = useCaseTypeOptions();
  const stateQuery = useJurisdictionOptions('state');

  const [docketNumber, setDocketNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [caseBackground, setCaseBackground] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  // Residential address, transcribed from the FIR - same field Data
  // Operator's own copy of this form now collects (see its own comment).
  // Editable afterward via this page's own "Edit User Record" panel below,
  // which already has an Address field wired to PATCH /users/:userId.
  const [address, setAddress] = useState('');
  const [stateId, setStateId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const districtQuery = useJurisdictionOptions('district', lockedJurisdictionId ? undefined : stateId);
  const caseTypeOptions = caseTypesQuery.data?.caseTypes || [];
  const stateOptions = stateQuery.data?.jurisdictions || [];
  const districtOptions = districtQuery.data?.jurisdictions || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setCreated(null);
    const jurisdictionId = lockedJurisdictionId || districtId;
    if (!docketNumber.trim() || !fullName.trim() || !contactNumber.trim() || !caseTypeId || !jurisdictionId) {
      setError('Please fill in all required fields.');
      return;
    }
    try {
      const result = await onCreate({
        docketNumber: docketNumber.trim(),
        fullName: fullName.trim(),
        contactNumber: contactNumber.trim(),
        password: password.trim() || undefined,
        jurisdictionId,
        caseTypeId,
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            onChange={(e) => setContactNumber(e.target.value.replace(/[^0-9]/g, ''))}
            maxLength={10}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="e.g. 9876543210"
          />
        </div>
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
      )}

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
        <p className="text-[10px] text-gray-400 mt-1">Used to recognize if this person already has another case elsewhere.</p>
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
          Shared only with the Protection Officer if this case is later referred to them for Relocation or Witness
          Protection - never shown to any other role. Can be added or corrected later from Edit User Record.
        </p>
      </div>

      <div>
        <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Case Type</label>
        <select value={caseTypeId} onChange={(e) => setCaseTypeId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">Select...</option>
          {caseTypeOptions.map((c) => <option key={c.case_type_id} value={c.case_type_id}>{c.name}</option>)}
        </select>
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
