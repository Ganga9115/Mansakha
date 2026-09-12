import React, { useState, useMemo } from 'react';
import MinistryLayout from '../layouts/MinistryLayout';
import {
  UserPlus,
  X,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Search,
  Users,
  Layers,
  MapPin,
  ChevronDown,
} from 'lucide-react';
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

const STATUS_BADGE = {
  active: 'bg-emerald-100 text-emerald-700',
  revoked: 'bg-gray-100 text-gray-500',
};

// Roles whose scope can be reassigned from this panel - the "fail-closed,
// must not be silently empty" design (an account created or left without
// one just sits with a permanently empty queue). DLSA Coordinator and
// Public Prosecutor share Protection Officer's own jurisdictionId shape.
const SCOPE_EDITABLE_ROLES = ['Protection Officer', 'DLSA Coordinator', 'Public Prosecutor', 'Rehabilitation Officer', 'Investigating Officer'];

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

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [page, setPage] = useState(1);

  // Queries
  const isUsersView = roleFilter === 'users';
  const staffRoleQueryParam = roleFilter && roleFilter !== 'users' ? roleFilter : undefined;
  const staffLevelQueryParam = levelFilter || undefined;

  const { data, loading, error, refetch } = useStaffList(staffRoleQueryParam, staffLevelQueryParam, page);
  const usersQuery = useMinistryUsers(page);
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const updateStaffScope = useUpdateStaffScope();
  const deleteStaff = useDeleteStaff();
  const designationOptionsQuery = useDesignationOptions();
  const DESIGNATIONS_BY_ROLE = designationOptionsQuery.data?.options || {};

  // All districts for dropdown filter
  const allDistrictsQuery = useJurisdictionOptions('district');
  const allDistricts = allDistrictsQuery.data?.jurisdictions || [];

  // Create form state
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

  // Edit row state
  const [editingId, setEditingId] = useState(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStaffId, setEditStaffId] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [showEditNewPassword, setShowEditNewPassword] = useState(false);
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

  // Filter staff based on search and district filter
  const displayedStaff = useMemo(() => {
    let list = staff;
    if (districtFilter) {
      list = list.filter((s) => {
        const scopeStr = `${s.jurisdictionName || ''} ${s.stationName || ''}`.toLowerCase();
        return scopeStr.includes(districtFilter.toLowerCase());
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((s) => (
        (s.fullName && s.fullName.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.roleName && s.roleName.toLowerCase().includes(q)) ||
        (s.jurisdictionName && s.jurisdictionName.toLowerCase().includes(q)) ||
        (s.providerName && s.providerName.toLowerCase().includes(q)) ||
        (s.stationName && s.stationName.toLowerCase().includes(q)) ||
        (s.staffId && s.staffId.toLowerCase().includes(q)) ||
        (s.designation && s.designation.toLowerCase().includes(q))
      ));
    }
    return list;
  }, [staff, districtFilter, searchQuery]);

  // Filter users based on search and district filter
  const displayedUsers = useMemo(() => {
    let list = users;
    if (districtFilter) {
      list = list.filter((u) => u.jurisdictionName?.toLowerCase().includes(districtFilter.toLowerCase()));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((u) => (
        (u.fullName && u.fullName.toLowerCase().includes(q)) ||
        (u.docketNumber && u.docketNumber.toLowerCase().includes(q)) ||
        (u.caseType && u.caseType.toLowerCase().includes(q)) ||
        (u.jurisdictionName && u.jurisdictionName.toLowerCase().includes(q)) ||
        (u.caseStage && u.caseStage.toLowerCase().includes(q)) ||
        (u.status && u.status.toLowerCase().includes(q))
      ));
    }
    return list;
  }, [users, districtFilter, searchQuery]);

  // Editing cascade options
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
    setEditJurisdictionId(s.jurisdictionId || '');
    setEditDesignation(s.designation || '');
    setEditProviderId(s.providerId || '');
    setEditStationStateId(s.stationStateId || '');
    setEditStationDistrictId(s.stationDistrictId || '');
    setEditStationId(s.stationId || '');
  };

  const cancelEdit = () => setEditingId(null);

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
      toast.error(err.message || 'Could not delete this account.');
    }
  };

  // Human-readable labels for dropdown buttons
  const selectedRoleLabel = roleFilter === 'users' ? 'Users' : roleFilter || 'All Roles';
  const selectedLevelLabel = levelFilter ? levelFilter.charAt(0).toUpperCase() + levelFilter.slice(1) : 'All Levels';
  const selectedDistrictLabel = districtFilter || 'All Districts';

  return (
    <MinistryLayout title="Staff Management">
      <div className="space-y-5">
        {/* Top Hero Card */}
        <div className="bg-gradient-to-r from-[#EFF6FB] via-[#F4F8FC] to-[#E9F3F9] border border-[#DCE8F2] rounded-2xl p-6 sm:p-7 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="max-w-xl z-10">
            <span className="text-[11px] font-bold tracking-wider text-[#6B859E] uppercase block mb-1">
              MANAGE YOUR TEAM
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1E293B] tracking-tight mb-2">
              Staff Management
            </h1>
            <p className="text-xs sm:text-sm text-[#64748B] font-normal leading-relaxed">
              Create and manage accounts for officials across different roles and administrative levels.
            </p>
          </div>

          {/* Right side illustration matching screenshot */}
          <div className="relative hidden md:flex items-center shrink-0 pr-2 select-none">
            {/* Dotted grid pattern */}
            <svg className="w-16 h-12 text-[#BFD7EA] mr-4 opacity-75" viewBox="0 0 60 40" fill="currentColor">
              <circle cx="5" cy="5" r="1.5" /><circle cx="20" cy="5" r="1.5" /><circle cx="35" cy="5" r="1.5" /><circle cx="50" cy="5" r="1.5" />
              <circle cx="5" cy="18" r="1.5" /><circle cx="20" cy="18" r="1.5" /><circle cx="35" cy="18" r="1.5" /><circle cx="50" cy="18" r="1.5" />
              <circle cx="5" cy="31" r="1.5" /><circle cx="20" cy="31" r="1.5" /><circle cx="35" cy="31" r="1.5" /><circle cx="50" cy="31" r="1.5" />
            </svg>

            {/* Avatars with plus badge */}
            <div className="relative flex items-center justify-center">
              <svg width="155" height="92" viewBox="0 0 155 92" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Background glow pill */}
                <ellipse cx="90" cy="46" rx="46" ry="38" fill="#E2EDF6" />
                {/* Left Avatar */}
                <g opacity="0.88">
                  <circle cx="50" cy="40" r="15" fill="#75A8CF" />
                  <path d="M38 60C38 52.5 43.5 50 50 50C56.5 50 62 52.5 62 60" fill="#75A8CF" />
                </g>
                {/* Right Avatar */}
                <g opacity="0.88">
                  <circle cx="112" cy="40" r="15" fill="#75A8CF" />
                  <path d="M100 60C100 52.5 105.5 50 112 50C118.5 50 124 52.5 124 60" fill="#75A8CF" />
                </g>
                {/* Center Avatar (Prominent) */}
                <g>
                  <circle cx="81" cy="33" r="19" fill="#4B8EBE" />
                  <path d="M66 65C66 54 73 51 81 51C89 51 96 54 96 65" fill="#4B8EBE" />
                </g>
                {/* Overlapping Plus Badge */}
                <circle cx="120" cy="56" r="13" fill="#1E3A5F" />
                <path d="M120 50V62M114 56H126" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* Filter and Action Bar */}
        <div className="bg-white rounded-xl border border-gray-200/90 p-2 sm:p-2.5 shadow-sm flex flex-wrap lg:flex-nowrap items-center gap-2 sm:gap-3">
          {/* Search Input */}
          <div className="flex-1 min-w-[240px] flex items-center pl-3 pr-2 py-1">
            <Search size={16} className="text-gray-400 shrink-0 mr-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, role, or district..."
              className="w-full text-xs sm:text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent"
            />
          </div>

          {/* ROLE Filter */}
          <div className="relative flex flex-col justify-center px-4 py-1 border-l border-gray-200 min-w-[130px]">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5 pointer-events-none">
              ROLE
            </span>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 pointer-events-none">
              <Users size={13} className="text-gray-400 shrink-0" />
              <span className="truncate">{selectedRoleLabel}</span>
              <ChevronDown size={13} className="text-gray-400 ml-auto shrink-0" />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              aria-label="Filter by role"
            >
              <option value="">All Roles</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="users">Users (Beneficiaries)</option>
            </select>
          </div>

          {/* ADMINISTRATIVE LEVEL Filter */}
          <div className="relative flex flex-col justify-center px-4 py-1 border-l border-gray-200 min-w-[155px]">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5 pointer-events-none">
              ADMINISTRATIVE LEVEL
            </span>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 pointer-events-none">
              <Layers size={13} className="text-gray-400 shrink-0" />
              <span className="truncate">{selectedLevelLabel}</span>
              <ChevronDown size={13} className="text-gray-400 ml-auto shrink-0" />
            </div>
            <select
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              aria-label="Filter by administrative level"
            >
              <option value="">All Levels</option>
              <option value="national">National</option>
              <option value="state">State</option>
              <option value="district">District</option>
            </select>
          </div>

          {/* DISTRICT Filter */}
          <div className="relative flex flex-col justify-center px-4 py-1 border-l border-gray-200 min-w-[130px]">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-0.5 pointer-events-none">
              DISTRICT
            </span>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 pointer-events-none">
              <MapPin size={13} className="text-gray-400 shrink-0" />
              <span className="truncate">{selectedDistrictLabel}</span>
              <ChevronDown size={13} className="text-gray-400 ml-auto shrink-0" />
            </div>
            <select
              value={districtFilter}
              onChange={(e) => { setDistrictFilter(e.target.value); setPage(1); }}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              aria-label="Filter by district"
            >
              <option value="">All Districts</option>
              {[...allDistricts].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                <option key={d.jurisdictionId} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Create Account Action Button */}
          {!isUsersView && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#4F96C9] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold shadow-sm transition ml-auto shrink-0"
            >
              {showForm ? <X size={14} /> : <UserPlus size={14} />}
              <span>{showForm ? 'Cancel' : 'Create Account'}</span>
            </button>
          )}
        </div>

        {/* Create Account Form */}
        {!isUsersView && showForm && (
          <form onSubmit={handleCreate} className="bg-white p-6 rounded-xl border border-gray-200/90 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-150">
            <div className="sm:col-span-2 flex items-center justify-between border-b border-gray-100 pb-3 mb-1">
              <div>
                <h2 className="text-sm font-bold text-gray-800">Create New Staff Account</h2>
                <p className="text-xs text-gray-400">Fill in the details to provision a new official account.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none" />
            </div>

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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Role</label>
              <select value={roleName} onChange={(e) => { setRoleName(e.target.value); if (e.target.value !== 'Counsellor') setPhone(''); }} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none">
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
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none"
                  >
                    {JURISDICTION_LEVELS.map((l) => <option key={l} value={l} className="capitalize">{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Jurisdiction</label>
                  <select value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none">
                    <option value="">Select...</option>
                    {jurisdictionOptions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.name}</option>)}
                  </select>
                </div>
              </>
            )}

            {['Protection Officer', 'DLSA Coordinator', 'Public Prosecutor'].includes(roleName) && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">District</label>
                <select value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none">
                  <option value="">Select...</option>
                  {jurisdictionOptions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.name}</option>)}
                </select>
              </div>
            )}

            {DESIGNATIONS_BY_ROLE[roleName] && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Designation (optional)</label>
                <select value={designation} onChange={(e) => setDesignation(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none">
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

            {roleName === 'Rehabilitation Officer' && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Rehabilitation Centre</label>
                <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none">
                  <option value="">Select...</option>
                  {providerOptions.map((p) => <option key={p.providerId} value={p.providerId}>{p.name} ({p.providerType})</option>)}
                </select>
              </div>
            )}

            {roleName === 'Investigating Officer' && (
              <>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">State</label>
                  <select
                    value={stationStateId}
                    onChange={(e) => { setStationStateId(e.target.value); setStationDistrictId(''); setStationId(''); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#519BCE] focus:outline-none"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50 focus:border-[#519BCE] focus:outline-none"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-50 focus:border-[#519BCE] focus:outline-none"
                  >
                    <option value="">{stationDistrictId ? (stationOptions.length ? 'Select...' : 'No stations set up here yet') : 'Select a district first'}</option>
                    {stationOptions.map((s) => <option key={s.stationId} value={s.stationId}>{s.name}</option>)}
                  </select>
                </div>
              </>
            )}

            <div className="sm:col-span-2 pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={createStaff.loading}
                className="px-5 py-2.5 bg-[#4F96C9] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-60"
              >
                {createStaff.loading ? 'Creating...' : 'Create Account'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Staff Table */}
        {!isUsersView && (
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F0F6FA] text-gray-500 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                    <th className="py-3.5 px-6">Name</th>
                    <th className="py-3.5 px-4">Role</th>
                    <th className="py-3.5 px-4">Scope</th>
                    <th className="py-3.5 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-14 text-center text-gray-400">
                        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-[#519BCE] mr-2 align-middle" />
                        Loading staff accounts...
                      </td>
                    </tr>
                  ) : error ? (
                    <tr><td colSpan={4} className="py-12 text-center text-rose-600">{error}</td></tr>
                  ) : displayedStaff.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 px-4">
                        {/* Empty state matching the screenshot */}
                        <div className="flex flex-col items-center justify-center text-center">
                          <div className="relative mb-3 flex items-center justify-center">
                            {/* Soft circular background */}
                            <div className="w-24 h-24 rounded-full bg-[#EDF5FB] flex items-center justify-center">
                              {/* Document with magnifying glass */}
                              <svg width="62" height="62" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="18" y="12" width="28" height="36" rx="4" stroke="#90B7D6" strokeWidth="2.2" fill="#FFFFFF" />
                                <line x1="24" y1="20" x2="34" y2="20" stroke="#B8D5EB" strokeWidth="2" strokeLinecap="round" />
                                <line x1="24" y1="26" x2="40" y2="26" stroke="#B8D5EB" strokeWidth="2" strokeLinecap="round" />
                                <line x1="24" y1="32" x2="36" y2="32" stroke="#B8D5EB" strokeWidth="2" strokeLinecap="round" />
                                <circle cx="39" cy="39" r="8" stroke="#7BA8CE" strokeWidth="2.5" fill="#EDF5FB" />
                                <line x1="45" y1="45" x2="52" y2="52" stroke="#7BA8CE" strokeWidth="2.5" strokeLinecap="round" />
                              </svg>
                            </div>
                          </div>
                          <h3 className="font-bold text-gray-800 text-sm sm:text-base">No staff accounts to display</h3>
                          <p className="text-xs text-gray-400 max-w-sm mt-1 mb-4">
                            Use the filters or create a new account to get started.
                          </p>
                          <button
                            onClick={() => setShowForm(true)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#4F96C9] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold shadow-sm transition"
                          >
                            <UserPlus size={13} />
                            <span>Create Account</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedStaff.map((s) => (
                      <React.Fragment key={s.officialId}>
                        <tr className="hover:bg-gray-50/70 transition">
                          <td className="py-4 px-6 font-bold text-gray-800">{s.fullName}</td>
                          <td className="py-4 px-4 text-gray-700 font-medium">{s.roleName}</td>
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

                              {SCOPE_EDITABLE_ROLES.includes(s.roleName) && (
                                <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl">
                                  {JURISDICTION_SCOPED_ROLES_EXCL_ADMIN.includes(s.roleName) && (
                                    <div>
                                      <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">District</label>
                                      <select value={editJurisdictionId} onChange={(e) => setEditJurisdictionId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                                        <option value="">{s.jurisdictionName ? `Currently: ${s.jurisdictionName}` : 'Not yet assigned - select...'}</option>
                                        {editJurisdictionOptions.map((j) => <option key={j.jurisdictionId} value={j.jurisdictionId}>{j.name}</option>)}
                                      </select>
                                    </div>
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
                                  className="px-4 py-2 bg-[#4F96C9] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold transition disabled:opacity-60"
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
          </div>
        )}

        {/* Users Oversight Table */}
        {isUsersView && (
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F0F6FA] text-gray-500 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
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
                    <tr>
                      <td colSpan={7} className="py-14 text-center text-gray-400">
                        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-[#519BCE] mr-2 align-middle" />
                        Loading user records...
                      </td>
                    </tr>
                  ) : usersQuery.error ? (
                    <tr><td colSpan={7} className="py-12 text-center text-rose-600">{usersQuery.error}</td></tr>
                  ) : displayedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 px-4">
                        <div className="flex flex-col items-center justify-center text-center">
                          <div className="relative mb-3 flex items-center justify-center">
                            <div className="w-24 h-24 rounded-full bg-[#EDF5FB] flex items-center justify-center">
                              <svg width="62" height="62" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="18" y="12" width="28" height="36" rx="4" stroke="#90B7D6" strokeWidth="2.2" fill="#FFFFFF" />
                                <line x1="24" y1="20" x2="34" y2="20" stroke="#B8D5EB" strokeWidth="2" strokeLinecap="round" />
                                <line x1="24" y1="26" x2="40" y2="26" stroke="#B8D5EB" strokeWidth="2" strokeLinecap="round" />
                                <line x1="24" y1="32" x2="36" y2="32" stroke="#B8D5EB" strokeWidth="2" strokeLinecap="round" />
                                <circle cx="39" cy="39" r="8" stroke="#7BA8CE" strokeWidth="2.5" fill="#EDF5FB" />
                                <line x1="45" y1="45" x2="52" y2="52" stroke="#7BA8CE" strokeWidth="2.5" strokeLinecap="round" />
                              </svg>
                            </div>
                          </div>
                          <h3 className="font-bold text-gray-800 text-sm sm:text-base">No user records to display</h3>
                          <p className="text-xs text-gray-400 max-w-sm mt-1">
                            No user records matched the selected criteria.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedUsers.map((u) => (
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
                    ))
                  )}
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
