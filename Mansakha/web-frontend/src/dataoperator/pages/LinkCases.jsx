import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Link as LinkIcon, User, Hash, Phone, CreditCard, Users, Shield, Info, Plus, X, FilePlus, FileText, MapPin, Building2, Folder, BarChart2, PlusCircle } from 'lucide-react';
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

  const navigate = useNavigate();

  if (!selectedPerson) {
    return (
      <StaffLayout title="Link Cases">
        <div className="space-y-6">
          {/* Main Banner */}
          <div className="bg-[#f5f8ff] p-8 rounded-2xl border border-blue-100 relative overflow-hidden flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1 relative z-10 w-full">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e6f0f9] text-[#519BCE] text-xs font-bold mb-4 uppercase tracking-wider">
                <LinkIcon size={14} />
                CASE LINKING
              </div>
              
              <h3 className="font-extrabold text-[28px] text-[#1e293b] mb-3 leading-tight">Find the person to link a case to</h3>
              <p className="text-gray-600 text-[13px] leading-relaxed mb-6 max-w-xl">
                Search by name, docket number, mobile number, or Aadhaar number. If this person already has one or more
                cases, they'll show up here so you can register a new one linked to them.
              </p>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 mb-4">
                <PersonSearchPicker onSelect={setSelectedPerson} />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] font-semibold text-gray-700">Try searching with:</span>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 shadow-sm"><User size={14} className="text-gray-400" /> Name</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 shadow-sm"><Hash size={14} className="text-gray-400" /> Docket Number</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 shadow-sm"><Phone size={14} className="text-gray-400" /> Mobile Number</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 shadow-sm"><CreditCard size={14} className="text-gray-400" /> Aadhaar Number</span>
                </div>
              </div>
            </div>

            {/* Illustration */}
            <div className="hidden lg:block relative w-64 h-48 flex-shrink-0">
              <div className="absolute right-4 top-8 w-40 h-48 bg-white rounded-xl shadow-sm border border-gray-200 transform rotate-6 z-0 flex flex-col p-4 gap-3">
                 <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center self-center mt-2">
                    <User className="text-[#519BCE]" size={24} />
                 </div>
                 <div className="w-full h-2 bg-gray-100 rounded-full mt-2"></div>
                 <div className="w-3/4 h-2 bg-gray-100 rounded-full"></div>
              </div>
              <div className="absolute right-12 top-12 w-40 h-48 bg-white rounded-xl shadow-md border border-gray-200 transform -rotate-3 z-10 flex flex-col items-center justify-center p-4">
                 <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                    <LinkIcon className="text-[#519BCE]" size={32} />
                 </div>
                 <div className="w-full h-3 bg-blue-100 rounded-full"></div>
                 <div className="w-2/3 h-3 bg-blue-100 rounded-full mt-2"></div>
              </div>
              <div className="absolute right-0 bottom-0 bg-white shadow-lg border border-gray-100 rounded-lg p-3 z-20 text-[11px] text-gray-600 font-medium max-w-[140px] leading-tight">
                Link related cases to build a complete view
              </div>
            </div>
          </div>

          {/* Three Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Users className="text-[#519BCE]" size={22} />
              </div>
              <div>
                <h4 className="font-bold text-[13px] text-gray-800 mb-1">Avoid Duplicate Registrations</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed pr-2">Check if the person already has cases before creating a new one.</p>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
                <LinkIcon className="text-purple-500" size={22} />
              </div>
              <div>
                <h4 className="font-bold text-[13px] text-gray-800 mb-1">Link Related Cases</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed pr-2">Keep all cases under the same individual for a complete view.</p>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <Shield className="text-emerald-500" size={22} />
              </div>
              <div>
                <h4 className="font-bold text-[13px] text-gray-800 mb-1">Ensure Data Accuracy</h4>
                <p className="text-[11px] text-gray-500 leading-relaxed pr-2">Use unique identifiers like mobile or Aadhaar for precise matching.</p>
              </div>
            </div>
          </div>

          {/* No results yet banner */}
          <div className="bg-[#f4f7fb] border border-gray-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#3d83b3] flex items-center justify-center flex-shrink-0">
                <Info className="text-white" size={20} />
              </div>
              <div>
                <h4 className="font-bold text-[13px] text-gray-800">No results yet?</h4>
                <p className="text-[12px] text-gray-500">If the person doesn't appear in the results, you can proceed to register a new case and link it to them.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dataoperator')}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-semibold transition whitespace-nowrap shadow-sm"
            >
              <Plus size={16} className="text-[#519BCE]" /> Register New Case
            </button>
          </div>
        </div>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout title="Link Cases">
      <div className="space-y-4 max-w-4xl">
        <button
          type="button"
          onClick={handleChangePerson}
          className="flex items-center gap-2 text-[13px] font-semibold text-[#519BCE] hover:underline mb-2"
        >
          <ArrowLeft size={16} /> Change person
        </button>

        <div className="bg-[#f4f7fb] border border-[#d6e8f5] rounded-xl px-5 py-4 flex items-start gap-4 mb-6 relative shadow-sm">
          <div className="w-8 h-8 rounded-full bg-[#3d83b3] text-white flex items-center justify-center flex-shrink-0 mt-0.5">
            <Info size={18} />
          </div>
          <div className="pt-0.5">
            <p className="text-[13px] text-[#1e293b]">
              <span className="font-bold">Registering a new case linked to {selectedPerson.fullName || 'this person'}</span>
              {' '}
              <span className="font-bold text-[#3d83b3]">({selectedPerson.cases.length} existing case{selectedPerson.cases.length === 1 ? '' : 's'}: {selectedPerson.cases.map((c) => c.docketNumber).join(', ')})</span>.
            </p>
            <p className="text-[12px] text-gray-500 mt-1">
              This new case will share their check-in history and assigned counsellor automatically.
            </p>
          </div>
          <button type="button" className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200/80 shadow-sm space-y-6">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
               <FilePlus className="text-[#519BCE]" size={24} />
            </div>
            <div>
              <h3 className="font-bold text-[16px] text-gray-800">New Case Details</h3>
              <p className="text-[12px] text-gray-500 mt-0.5">Enter the details for the new case to link with this person.</p>
            </div>
          </div>

          <div className="grid gap-6">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Docket Number <span className="text-rose-500">*</span></label>
              <div className="relative flex items-center">
                <div className="absolute left-3 text-gray-400">
                  <FileText size={16} />
                </div>
                <input
                  type="text"
                  value={docketNumber}
                  onChange={(e) => setDocketNumber(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#519BCE]/20 focus:border-[#519BCE] transition-all"
                  placeholder="e.g. DKT-2026-00456"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">State <span className="text-rose-500">*</span></label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 text-gray-400 pointer-events-none">
                    <MapPin size={16} />
                  </div>
                  <select
                    value={stateId}
                    onChange={(e) => { setStateId(e.target.value); setDistrictId(''); }}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#519BCE]/20 focus:border-[#519BCE] transition-all appearance-none"
                  >
                    <option value="">Select state...</option>
                    {[...stateOptions].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                      <option key={s.jurisdictionId} value={s.jurisdictionId}>{s.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 text-gray-400 pointer-events-none">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">District <span className="text-rose-500">*</span></label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 text-gray-400 pointer-events-none">
                    <Building2 size={16} />
                  </div>
                  <select
                    value={districtId}
                    onChange={(e) => setDistrictId(e.target.value)}
                    disabled={!stateId}
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#519BCE]/20 focus:border-[#519BCE] transition-all appearance-none disabled:bg-gray-50 disabled:text-gray-400"
                  >
                    <option value="">{stateId ? 'Select district...' : 'Select a state first...'}</option>
                    {[...districtOptions].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                      <option key={d.jurisdictionId} value={d.jurisdictionId}>{d.name}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 text-gray-400 pointer-events-none">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Case Type <span className="text-rose-500">*</span></label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 text-gray-400 pointer-events-none">
                    <Folder size={16} />
                  </div>
                  <select value={caseTypeId} onChange={(e) => setCaseTypeId(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#519BCE]/20 focus:border-[#519BCE] transition-all appearance-none">
                    <option value="">Select case type...</option>
                    {caseTypeOptions.map((c) => <option key={c.case_type_id} value={c.case_type_id}>{c.name}</option>)}
                  </select>
                  <div className="absolute right-3 text-gray-400 pointer-events-none">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Case Stage <span className="text-rose-500">*</span></label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 text-gray-400 pointer-events-none">
                    <BarChart2 size={16} />
                  </div>
                  <select value={caseStage} onChange={(e) => setCaseStage(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#519BCE]/20 focus:border-[#519BCE] transition-all appearance-none">
                    <option value="">Investigation (default)</option>
                    {CASE_STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="absolute right-3 text-gray-400 pointer-events-none">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Case Background (Optional)</label>
              <div className="relative">
                <div className="absolute left-3 top-3 text-gray-400 pointer-events-none">
                  <FileText size={16} />
                </div>
                <textarea
                  value={caseBackground}
                  onChange={(e) => setCaseBackground(e.target.value.slice(0, 500))}
                  rows={4}
                  className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#519BCE]/20 focus:border-[#519BCE] transition-all resize-none"
                  placeholder="Brief context for the assigned counsellor - shown on Case Detail..."
                />
                <div className="absolute right-2 bottom-2 text-[10px] text-gray-400 font-medium">
                  {caseBackground.length}/500
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-rose-600 mt-4">{error}</p>}

          {created && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 space-y-2 mt-4">
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

          <div className="pt-2">
            <button
              type="submit"
              disabled={registerLinkedCase.loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-[14px] font-semibold transition-all disabled:opacity-60 shadow-sm"
            >
              <PlusCircle size={18} />
              {registerLinkedCase.loading ? 'Creating...' : 'Create Linked Case'}
            </button>
          </div>
        </form>
      </div>
    </StaffLayout>
  );
}
