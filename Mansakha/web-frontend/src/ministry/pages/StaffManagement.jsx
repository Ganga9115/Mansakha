import React, { useState } from 'react';
import MinistryLayout from '../layouts/MinistryLayout';
import { UserPlus, X, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import {
  useStaffList,
  useMinistryUsers,
  useCreateStaff,
  useUpdateStaff,
  useUpdateStaffScope,
  useDeleteStaff,
  useJurisdictionOptions,
  useRehabilitationProviderOptions,
  usePoliceStationOptions,
  useDesignationOptions,
} from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

// Special Public Prosecutor stays retired (absorbed into DLSA Coordinator) -
// the other 6 coordination roles built this session were, until now, only
// ever creatable via direct API calls - never actually reachable from this
// page, despite CREATABLE_ROLES already allowing every one of them
// server-side. Public Prosecutor (migration_040) - the DLSA-assigned
// advocate role for the dedicated Legal Aid pipeline - joins the same way.
const ROLE_OPTIONS = [
  'Counsellor', 'Administration', 'Data Operator',
  'Investigating Officer', 'District Welfare Officer', 'Protection Officer',
  'DLSA Coordinator', 'District Collector', 'Rehabilitation Officer',
  'Public Prosecutor',
];
const JURISDICTION_LEVELS = ['district', 'state', 'national'];

// Roles whose queue is jurisdiction-scoped the same way Administration's own
// is (Protection Officer - "nearby officer" means "assigned to the victim's
// own district", same jurisdiction_id column, just not tiered by level like
// Administration's National/State/District split). DLSA Coordinator
// (migration_040) and Public Prosecutor join this same list - both are
// backend-required to have one (ministry.routes.js's own jurisdictionId
// checks), so without this the Create form silently omitted the field
// entirely and every attempt to create either failed with a 400 the form
// gave no way to fix.
const JURISDICTION_SCOPED_ROLES = ['Administration', 'Protection Officer', 'DLSA Coordinator', 'Public Prosecutor'];
// Same set minus Administration, whose jurisdiction is fixed at creation and
// never reassigned from this scope-editing panel (SCOPE_EDITABLE_ROLES below).
const JURISDICTION_SCOPED_ROLES_EXCL_ADMIN = ['Protection Officer', 'DLSA Coordinator', 'Public Prosecutor'];

// Designation lists are fetched from the server (see useDesignationOptions)
// rather than duplicated here - the hardcoded copy that used to live at this
// spot had already drifted out of sync with the real list, still offering
// designations the backend would reject.

const STATUS_BADGE = {
  active: 'bg-emerald-100 text-emerald-700',
  revoked: 'bg-gray-100 text-gray-500',
};

// One tab per category the Ministry needs to browse - National/State/District
// Admin are all role='Administration', split only by jurisdiction level;
// every other role is its own tab. Users is a separate endpoint/shape
// entirely (Section 3/8's oversight remit over every user record, not just
// what one Data Operator provisioned).
const STAFF_TABS = [
  { key: 'national', label: 'National Admin', role: 'Administration', level: 'national' },
  { key: 'state', label: 'State Admins', role: 'Administration', level: 'state' },
  { key: 'district', label: 'District Admins', role: 'Administration', level: 'district' },
  { key: 'counsellor', label: 'Counsellors', role: 'Counsellor', level: undefined },
  { key: 'dataoperator', label: 'Data Operators', role: 'Data Operator', level: undefined },
  { key: 'io', label: 'Investigating Officers', role: 'Investigating Officer', level: undefined },
  { key: 'dwo', label: 'Welfare Officers', role: 'District Welfare Officer', level: undefined },
  { key: 'po', label: 'Protection Officers', role: 'Protection Officer', level: undefined },
  { key: 'dlsa', label: 'DLSA Coordinators', role: 'DLSA Coordinator', level: undefined },
  { key: 'legalrep', label: 'Public Prosecutors', role: 'Public Prosecutor', level: undefined },
  { key: 'dc', label: 'District Collectors', role: 'District Collector', level: undefined },
  { key: 'rehab', label: 'Rehabilitation Officers', role: 'Rehabilitation Officer', level: undefined },
];
const USERS_TAB = { key: 'users', label: 'Users' };
const TABS = [...STAFF_TABS, USERS_TAB];

function Pagination({ page, pageSize, total, onChange }) {
  if (total <= pageSize) return null;
  const lastPage = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 text-xs text-gray-500">
      <span>{from}-{to} of {total}</span>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 border border-gray-300 rounded-md font-medium disabled:opacity-40 hover:bg-gray-50 transition"
        >
          Previous
        </button>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= lastPage}
          className="px-3 py-1.5 border border-gray-300 rounded-md font-medium disabled:opacity-40 hover:bg-gray-50 transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function StaffManagement() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState(STAFF_TABS[0].key);
  const [page, setPage] = useState(1);
  const tab = TABS.find((t) => t.key === activeTab);

  const { data, loading, error, refetch } = useStaffList(tab.role, tab.level, page);
  const usersQuery = useMinistryUsers(page);
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const updateStaffScope = useUpdateStaffScope();
  const deleteStaff = useDeleteStaff();
  const designationOptionsQuery = useDesignationOptions();
  const DESIGNATIONS_BY_ROLE = designationOptionsQuery.data?.options || {};

  const switchTab = (key) => { setActiveTab(key); setPage(1); };

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleName, setRoleName] = useState('Counsellor');
  const [jurisdictionLevel, setJurisdictionLevel] = useState('district');
  const [jurisdictionId, setJurisdictionId] = useState('');
  const [designation, setDesignation] = useState('');
  const [providerId, setProviderId] = useState('');
  const [stationStateId, setStationStateId] = useState('');
  const [stationDistrictId, setStationDistrictId] = useState('');
  const [stationId, setStationId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStaffId, setEditStaffId] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [showEditNewPassword, setShowEditNewPassword] = useState(false);
  // Scope reassignment (District/Centre/Station) on the row currently being
  // edited - kept fully separate from the Create form's own state above so
  // both can be open at once without cross-contaminating each other.
  const [editJurisdictionId, setEditJurisdictionId] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editStationStateId, setEditStationStateId] = useState('');
  const [editStationDistrictId, setEditStationDistrictId] = useState('');
  const [editStationId, setEditStationId] = useState('');

  const jurisdictionQuery = useJurisdictionOptions(
    roleName === 'Administration' ? jurisdictionLevel : JURISDICTION_SCOPED_ROLES.includes(roleName) ? 'district' : undefined
  );
  const jurisdictionOptions = jurisdictionQuery.data?.jurisdictions || [];

  const providerQuery = useRehabilitationProviderOptions();
  const providerOptions = providerQuery.data?.providers || [];

  // Station is scoped to a district - same State -> District -> Station
  // cascade as Data Operator's own intake form.
  const stationStateQuery = useJurisdictionOptions(roleName === 'Investigating Officer' ? 'state' : undefined);
  const stationDistrictQuery = useJurisdictionOptions(roleName === 'Investigating Officer' ? 'district' : undefined, stationStateId);
  const stationQuery = usePoliceStationOptions(stationDistrictId);
  const stationStateOptions = stationStateQuery.data?.jurisdictions || [];
  const stationDistrictOptions = stationDistrictQuery.data?.jurisdictions || [];
  const stationOptions = stationQuery.data?.stations || [];

  const staff = data?.staff || [];
  const total = data?.total || 0;
  const pageSize = data?.pageSize || 30;
  const users = usersQuery.data?.users || [];
  const usersTotal = usersQuery.data?.total || 0;
  const usersPageSize = usersQuery.data?.pageSize || 30;

  // Same cascade as Create's own, bound to the Edit panel's own state.
  const editingStaffRow = editingId ? staff.find((s) => s.officialId === editingId) : null;
  const editingRole = editingStaffRow?.roleName;
  const editJurisdictionQuery = useJurisdictionOptions(JURISDICTION_SCOPED_ROLES_EXCL_ADMIN.includes(editingRole) ? 'district' : undefined);
  const editJurisdictionOptions = editJurisdictionQuery.data?.jurisdictions || [];
  const editStationStateQuery = useJurisdictionOptions(editingRole === 'Investigating Officer' ? 'state' : undefined);
  const editStationDistrictQuery = useJurisdictionOptions(editingRole === 'Investigating Officer' ? 'district' : undefined, editStationStateId);
  const editStationQuery = usePoliceStationOptions(editStationDistrictId);
  const editStationStateOptions = editStationStateQuery.data?.jurisdictions || [];
  const editStationDistrictOptions = editStationDistrictQuery.data?.jurisdictions || [];
  const editStationOptions = editStationQuery.data?.stations || [];

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await createStaff.mutate({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        roleName,
        password,
        jurisdictionId: JURISDICTION_SCOPED_ROLES.includes(roleName) ? jurisdictionId : undefined,
        designation: DESIGNATIONS_BY_ROLE[roleName] ? designation || undefined : undefined,
        providerId: roleName === 'Rehabilitation Officer' ? providerId : undefined,
        stationId: roleName === 'Investigating Officer' ? stationId : undefined,
      });
      setShowForm(false);
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setShowPassword(false);
      setJurisdictionId('');
      setDesignation('');
      setProviderId('');
      setStationStateId('');
      setStationDistrictId('');
      setStationId('');
      refetch();
    } catch (err) {
      // e.g. the 1-per-district/state limit rejection - whole-action-failed,
      // so a toast fits better than a raw-string inline dump next to the form.
      toast.error(err.message || 'Could not create this account.');
    }
  };

  const startEdit = (s) => {
    setEditingId(s.officialId);
    setEditFullName(s.fullName || '');
    setEditPhone(s.phone || '');
    setEditStaffId(s.staffId || '');
    setEditNewPassword('');
    setShowEditNewPassword(false);
    // Pre-fill the scope picker with this account's current assignment (or
    // blank if it has none yet - exactly the "-" case that started this).
    setEditJurisdictionId(s.jurisdictionId || '');
    setEditDesignation(s.designation || '');
    setEditProviderId(s.providerId || '');
    setEditStationStateId(s.stationStateId || '');
    setEditStationDistrictId(s.stationDistrictId || '');
    setEditStationId(s.stationId || '');
  };

  const cancelEdit = () => setEditingId(null);

  // Roles whose scope can be reassigned from this panel - the "fail-closed,
  // must not be silently empty" design (an account created or left without
  // one just sits with a permanently empty queue). DLSA Coordinator and
  // Public Prosecutor share Protection Officer's own jurisdictionId shape.
  const SCOPE_EDITABLE_ROLES = ['Protection Officer', 'DLSA Coordinator', 'Public Prosecutor', 'Rehabilitation Officer', 'Investigating Officer'];

  const handleSaveEdit = async (officialId) => {
    if (editNewPassword && editNewPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    const role = editingStaffRow?.roleName;
    if (SCOPE_EDITABLE_ROLES.includes(role)) {
      const scopePayload =
        JURISDICTION_SCOPED_ROLES_EXCL_ADMIN.includes(role) ? { jurisdictionId: editJurisdictionId } :
        role === 'Rehabilitation Officer' ? { providerId: editProviderId } :
        { stationId: editStationId };
      const missing = Object.values(scopePayload).every((v) => !v);
      if (missing) {
        toast.error(`Kindly select a ${JURISDICTION_SCOPED_ROLES_EXCL_ADMIN.includes(role) ? 'district' : role === 'Rehabilitation Officer' ? 'rehabilitation centre' : 'police station'} before saving.`);
        return;
      }
    }
    try {
      await updateStaff.mutate(officialId, {
        fullName: editFullName.trim(),
        phone: editPhone.trim() || null,
        staffId: editStaffId.trim(),
        // Only sent when the admin actually typed one - otherwise the
        // account keeps its existing password. Setting one always forces a
        // change on next login (backend sets must_change_password back to
        // true), same as a brand-new account.
        ...(editNewPassword ? { newPassword: editNewPassword } : {}),
      });
      if (SCOPE_EDITABLE_ROLES.includes(role)) {
        await updateStaffScope.mutate(officialId, role, {
          jurisdictionId: JURISDICTION_SCOPED_ROLES_EXCL_ADMIN.includes(role) ? editJurisdictionId : undefined,
          designation: DESIGNATIONS_BY_ROLE[role] ? editDesignation || undefined : undefined,
          providerId: role === 'Rehabilitation Officer' ? editProviderId : undefined,
          stationId: role === 'Investigating Officer' ? editStationId : undefined,
        });
      }
      setEditingId(null);
      refetch();
    } catch (err) {
      toast.error(err.message || 'Could not update this account.');
    }
  };

  const handleDelete = async (officialId) => {
    if (!window.confirm('Permanently delete this account? This cannot be undone.')) return;
    try {
      await deleteStaff.mutate(officialId);
      setEditingId(null);
      refetch();
    } catch (err) {
      // e.g. the account already has activity history - revoke is the
      // correct action there; surfaced as a toast rather than a raw error.
      toast.error(err.message || 'Could not delete this account.');
    }
  };

  return (
    <MinistryLayout title="Staff Management">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === t.key
                    ? 'bg-[#519BCE] text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab !== 'users' && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              {showForm ? <X size={14} /> : <UserPlus size={14} />}
              {showForm ? 'Cancel' : 'Create Account'}
            </button>
          )}
        </div>

        {activeTab !== 'users' && showForm && (
          <form onSubmit={handleCreate} className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            {/* Phone only means anything for Counsellor - needed for the
                Call Counsellor/WhatsApp redirect a user can trigger
                (user/routes/user.routes.js), not a login credential; staff
                login is email + password only (core/routes/auth.staff.routes.js).
                Administration and Data Operator accounts never use it. */}
            {roleName === 'Counsellor' && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
                  Phone (required - used for Call/WhatsApp contact)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            )}
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Role</label>
              <select value={roleName} onChange={(e) => { setRoleName(e.target.value); if (e.target.value !== 'Counsellor') setPhone(''); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Temporary Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Required"
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {roleName === 'Administration' && (
              <>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction Level</label>
                  <select
                    value={jurisdictionLevel}
                    onChange={(e) => { setJurisdictionLevel(e.target.value); setJurisdictionId(''); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    {JURISDICTION_LEVELS.map((l) => <option key={l} value={l} className="capitalize">{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction</label>
                  <select value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="">Select...</option>
                    {jurisdictionOptions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.name}</option>)}
                  </select>
                </div>
              </>
            )}
            {/* Protection Officer's "nearby officer" is jurisdiction-scoped
                the same way Administration's own queue is - just one flat
                district, not tiered by level. DLSA Coordinator (the real
                DLSA structure is one authority per district) and Legal
                Representative (assigned by DLSA out of their own district's
                pool) are the same shape. */}
            {['Protection Officer', 'DLSA Coordinator', 'Public Prosecutor'].includes(roleName) && (
              <>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">District</label>
                  <select value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="">Select...</option>
                    {jurisdictionOptions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.name}</option>)}
                  </select>
                </div>
              </>
            )}
            {/* migration_035 - real-world rank/title, constrained to the
                posts that may actually hold this role (PoA Act Rules for
                Protection Officer; Rule 7's DySP-and-above bar for
                Investigating Officer), never free text. */}
            {DESIGNATIONS_BY_ROLE[roleName] && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Designation (optional)</label>
                <select value={designation} onChange={(e) => setDesignation(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">Not specified</option>
                  {DESIGNATIONS_BY_ROLE[roleName].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {roleName === 'Investigating Officer' && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Rule 7, SC/ST (PoA) Rules 1995: an atrocity case must be investigated by an officer not below the rank of DySP.
                  </p>
                )}
              </div>
            )}
            {/* migration_031 - which centre this Rehabilitation Officer
                works for; otherwise their queue is empty by design. */}
            {roleName === 'Rehabilitation Officer' && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Rehabilitation Centre</label>
                <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">Select...</option>
                  {providerOptions.map((p) => <option key={p.providerId} value={p.providerId}>{p.name} ({p.providerType})</option>)}
                </select>
              </div>
            )}
            {/* migration_033 - which police station this Investigating
                Officer works at, cascaded State -> District -> Station same
                as Data Operator's own intake form. */}
            {roleName === 'Investigating Officer' && (
              <>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">State</label>
                  <select
                    value={stationStateId}
                    onChange={(e) => { setStationStateId(e.target.value); setStationDistrictId(''); setStationId(''); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Select...</option>
                    {[...stationStateOptions].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                      <option key={s.jurisdictionId} value={s.jurisdictionId}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">District</label>
                  <select
                    value={stationDistrictId}
                    onChange={(e) => { setStationDistrictId(e.target.value); setStationId(''); }}
                    disabled={!stationStateId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50"
                  >
                    <option value="">{stationStateId ? 'Select...' : 'Select a state first'}</option>
                    {[...stationDistrictOptions].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                      <option key={d.jurisdictionId} value={d.jurisdictionId}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Police Station</label>
                  <select
                    value={stationId}
                    onChange={(e) => setStationId(e.target.value)}
                    disabled={!stationDistrictId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50"
                  >
                    <option value="">{stationDistrictId ? (stationOptions.length ? 'Select...' : 'No stations set up here yet') : 'Select a district first'}</option>
                    {stationOptions.map((s) => <option key={s.stationId} value={s.stationId}>{s.name}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="col-span-2">
              <button type="submit" disabled={createStaff.loading} className="px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60">
                {createStaff.loading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        )}

        {activeTab !== 'users' && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">Name</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Scope</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {loading ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : error ? (
                  <tr><td colSpan={4} className="py-8 text-center text-rose-600">{error}</td></tr>
                ) : staff.length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">No staff accounts yet.</td></tr>
                ) : staff.map((s) => (
                  <React.Fragment key={s.officialId}>
                    <tr className="hover:bg-gray-50/70 transition">
                      <td className="py-4 px-6 font-bold text-gray-800">{s.fullName}</td>
                      <td className="py-4 px-4 text-gray-700 font-medium">{s.roleName}</td>
                      {/* Whichever scope this role actually uses - jurisdiction
                          (Administration, Protection Officer), centre
                          (Rehabilitation Officer), or station (Investigating
                          Officer) - "-" for roles with none (DWO, DLSA,
                          District Collector aren't scoped at all today). */}
                      <td className="py-4 px-4 text-gray-700">
                        {s.jurisdictionName || s.providerName || s.stationName || '-'}
                        {s.designation && <span className="block text-[10px] text-gray-400 font-normal">{s.designation}</span>}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => (editingId === s.officialId ? cancelEdit() : startEdit(s))}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-md text-xs font-medium transition ml-auto"
                        >
                          <Pencil size={12} />
                          {editingId === s.officialId ? 'Close' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                    {editingId === s.officialId && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={4} className="p-5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl">
                            <div>
                              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Full Name</label>
                              <input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Email</label>
                              <input
                                value={s.email || ''}
                                readOnly
                                title="Email is the login identifier and can't be changed here"
                                className="w-full px-3 py-2 border border-transparent bg-gray-100 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                              />
                            </div>
                            {s.roleName === 'Counsellor' && (
                              <div>
                                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Phone (Call/WhatsApp contact)</label>
                                <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
                              </div>
                            )}
                            <div>
                              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Staff ID</label>
                              <input value={editStaffId} onChange={(e) => setEditStaffId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">New Password</label>
                              <div className="relative">
                                <input
                                  type={showEditNewPassword ? 'text' : 'password'}
                                  value={editNewPassword}
                                  onChange={(e) => setEditNewPassword(e.target.value)}
                                  placeholder="Leave blank to keep current"
                                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowEditNewPassword((v) => !v)}
                                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                  tabIndex={-1}
                                  aria-label={showEditNewPassword ? 'Hide password' : 'Show password'}
                                >
                                  {showEditNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Scope reassignment - Protection Officer/Rehabilitation
                              Officer/Investigating Officer only, the 3 roles whose
                              queue is fail-closed empty without one. */}
                          {SCOPE_EDITABLE_ROLES.includes(s.roleName) && (
                            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl">
                              {JURISDICTION_SCOPED_ROLES_EXCL_ADMIN.includes(s.roleName) && (
                                <>
                                  <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">District</label>
                                    <select value={editJurisdictionId} onChange={(e) => setEditJurisdictionId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                                      <option value="">{s.jurisdictionName ? `Currently: ${s.jurisdictionName}` : 'Not yet assigned - select...'}</option>
                                      {editJurisdictionOptions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.name}</option>)}
                                    </select>
                                  </div>
                                </>
                              )}
                              {DESIGNATIONS_BY_ROLE[s.roleName] && (
                                <div>
                                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Designation (optional)</label>
                                  <select value={editDesignation} onChange={(e) => setEditDesignation(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                                    <option value="">{s.designation ? `Currently: ${s.designation}` : 'Not specified'}</option>
                                    {DESIGNATIONS_BY_ROLE[s.roleName].map((d) => <option key={d} value={d}>{d}</option>)}
                                  </select>
                                </div>
                              )}
                              {s.roleName === 'Rehabilitation Officer' && (
                                <div>
                                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Rehabilitation Centre</label>
                                  <select value={editProviderId} onChange={(e) => setEditProviderId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                                    <option value="">{s.providerName ? `Currently: ${s.providerName}` : 'Not yet assigned - select...'}</option>
                                    {providerOptions.map((p) => <option key={p.providerId} value={p.providerId}>{p.name} ({p.providerType})</option>)}
                                  </select>
                                </div>
                              )}
                              {s.roleName === 'Investigating Officer' && (
                                <>
                                  <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">State</label>
                                    <select
                                      value={editStationStateId}
                                      onChange={(e) => { setEditStationStateId(e.target.value); setEditStationDistrictId(''); setEditStationId(''); }}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                    >
                                      <option value="">Select...</option>
                                      {[...editStationStateOptions].sort((a, b) => a.name.localeCompare(b.name)).map((st) => (
                                        <option key={st.jurisdictionId} value={st.jurisdictionId}>{st.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">District</label>
                                    <select
                                      value={editStationDistrictId}
                                      onChange={(e) => { setEditStationDistrictId(e.target.value); setEditStationId(''); }}
                                      disabled={!editStationStateId}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50"
                                    >
                                      <option value="">{editStationStateId ? 'Select...' : 'Select a state first'}</option>
                                      {[...editStationDistrictOptions].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                                        <option key={d.jurisdictionId} value={d.jurisdictionId}>{d.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Police Station</label>
                                    <select
                                      value={editStationId}
                                      onChange={(e) => setEditStationId(e.target.value)}
                                      disabled={!editStationDistrictId}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50"
                                    >
                                      <option value="">{s.stationName && !editStationDistrictId ? `Currently: ${s.stationName}` : editStationDistrictId ? (editStationOptions.length ? 'Select...' : 'No stations set up here yet') : 'Select a district first'}</option>
                                      {editStationOptions.map((st) => <option key={st.stationId} value={st.stationId}>{st.name}</option>)}
                                    </select>
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          <div className="mt-4 flex items-center gap-3">
                            <button
                              onClick={() => handleSaveEdit(s.officialId)}
                              disabled={updateStaff.loading}
                              className="px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
                            >
                              {updateStaff.loading ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                              onClick={() => handleDelete(s.officialId)}
                              disabled={deleteStaff.loading}
                              className="flex items-center gap-1.5 px-4 py-2 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition disabled:opacity-60"
                            >
                              <Trash2 size={13} />
                              {deleteStaff.loading ? 'Deleting...' : 'Delete Account'}
                            </button>
                            {editNewPassword && (
                              <span className="text-[11px] text-gray-400">They'll be asked to change it on next login.</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
        </div>
        )}

        {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">Name</th>
                  <th className="py-3.5 px-4">Docket</th>
                  <th className="py-3.5 px-4">Case Type</th>
                  <th className="py-3.5 px-4">Jurisdiction</th>
                  <th className="py-3.5 px-4">Case Stage</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-6">Provisioned Via</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {usersQuery.loading ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : usersQuery.error ? (
                  <tr><td colSpan={7} className="py-8 text-center text-rose-600">{usersQuery.error}</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">No user records yet.</td></tr>
                ) : users.map((u) => (
                  <tr key={u.userId} className="hover:bg-gray-50/70 transition">
                    <td className="py-4 px-6 font-bold text-gray-800">{u.fullName || '-'}</td>
                    <td className="py-4 px-4 text-gray-700">{u.docketNumber || '-'}</td>
                    <td className="py-4 px-4 text-gray-700">{u.caseType || '-'}</td>
                    <td className="py-4 px-4 text-gray-700">{u.jurisdictionName || '-'}</td>
                    <td className="py-4 px-4 text-gray-700">{u.caseStage}</td>
                    <td className="py-4 px-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${STATUS_BADGE[u.status] || 'bg-gray-100 text-gray-600'}`}>{u.status}</span>
                    </td>
                    <td className="py-4 px-6 text-gray-700">{u.provisionedVia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={usersPageSize} total={usersTotal} onChange={setPage} />
        </div>
        )}
      </div>
    </MinistryLayout>
  );
}
