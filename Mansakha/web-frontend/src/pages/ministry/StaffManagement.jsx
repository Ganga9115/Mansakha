import React, { useState } from 'react';
import MinistryLayout from '../../layouts/MinistryLayout';
import { UserPlus, X, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import {
  useStaffList,
  useMinistryVictims,
  useCreateStaff,
  useUpdateStaff,
  useDeleteStaff,
  useJurisdictionOptions,
} from '../../services/hooks';
import { useToast } from '../../context/ToastContext';

const ROLE_OPTIONS = ['Counsellor', 'Administration', 'Data Operator'];
const JURISDICTION_LEVELS = ['district', 'state', 'national'];

const STATUS_BADGE = {
  active: 'bg-emerald-100 text-emerald-700',
  revoked: 'bg-gray-100 text-gray-500',
};

// One tab per category the Ministry needs to browse - National/State/District
// Admin are all role='Administration', split only by jurisdiction level;
// Counsellor/Data Operator are their own roles; Victims is a separate
// endpoint/shape entirely (Section 3/8's oversight remit over every victim
// record, not just what one Data Operator provisioned).
const STAFF_TABS = [
  { key: 'national', label: 'National Admin', role: 'Administration', level: 'national' },
  { key: 'state', label: 'State Admins', role: 'Administration', level: 'state' },
  { key: 'district', label: 'District Admins', role: 'Administration', level: 'district' },
  { key: 'counsellor', label: 'Counsellors', role: 'Counsellor', level: undefined },
  { key: 'dataoperator', label: 'Data Operators', role: 'Data Operator', level: undefined },
];
const VICTIMS_TAB = { key: 'victims', label: 'Victims' };
const TABS = [...STAFF_TABS, VICTIMS_TAB];

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
  const victimsQuery = useMinistryVictims(page);
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();

  const switchTab = (key) => { setActiveTab(key); setPage(1); };

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleName, setRoleName] = useState('Counsellor');
  const [jurisdictionLevel, setJurisdictionLevel] = useState('district');
  const [jurisdictionId, setJurisdictionId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStaffId, setEditStaffId] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [showEditNewPassword, setShowEditNewPassword] = useState(false);

  const jurisdictionQuery = useJurisdictionOptions(
    roleName === 'Administration' ? jurisdictionLevel : undefined
  );
  const jurisdictionOptions = jurisdictionQuery.data?.jurisdictions || [];

  const staff = data?.staff || [];
  const total = data?.total || 0;
  const pageSize = data?.pageSize || 30;
  const victims = victimsQuery.data?.victims || [];
  const victimsTotal = victimsQuery.data?.total || 0;
  const victimsPageSize = victimsQuery.data?.pageSize || 30;

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await createStaff.mutate({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        roleName,
        password,
        jurisdictionId: roleName === 'Administration' ? jurisdictionId : undefined,
      });
      setShowForm(false);
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setShowPassword(false);
      setJurisdictionId('');
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
  };

  const cancelEdit = () => setEditingId(null);

  const handleSaveEdit = async (officialId) => {
    if (editNewPassword && editNewPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
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

          {activeTab !== 'victims' && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              {showForm ? <X size={14} /> : <UserPlus size={14} />}
              {showForm ? 'Cancel' : 'Create Account'}
            </button>
          )}
        </div>

        {activeTab !== 'victims' && showForm && (
          <form onSubmit={handleCreate} className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            {/* Phone only means anything for Counsellor - it's their 4th
                login credential (routes/auth.staff.js); Administration and
                Data Operator accounts never use it for anything. */}
            {roleName === 'Counsellor' && (
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
                  Phone (required - also their login credential)
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
            <div className="col-span-2">
              <button type="submit" disabled={createStaff.loading} className="px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60">
                {createStaff.loading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        )}

        {activeTab !== 'victims' && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">Name</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Jurisdiction</th>
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
                      <td className="py-4 px-4 text-gray-700">{s.jurisdictionName || '-'}</td>
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
                          <div className="grid grid-cols-4 gap-4 max-w-4xl">
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
                                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Phone (login credential)</label>
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

        {activeTab === 'victims' && (
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
                {victimsQuery.loading ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : victimsQuery.error ? (
                  <tr><td colSpan={7} className="py-8 text-center text-rose-600">{victimsQuery.error}</td></tr>
                ) : victims.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">No victim records yet.</td></tr>
                ) : victims.map((v) => (
                  <tr key={v.victimId} className="hover:bg-gray-50/70 transition">
                    <td className="py-4 px-6 font-bold text-gray-800">{v.fullName || '-'}</td>
                    <td className="py-4 px-4 text-gray-700">{v.docketNumber || '-'}</td>
                    <td className="py-4 px-4 text-gray-700">{v.caseType || '-'}</td>
                    <td className="py-4 px-4 text-gray-700">{v.jurisdictionName || '-'}</td>
                    <td className="py-4 px-4 text-gray-700">{v.caseStage}</td>
                    <td className="py-4 px-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${STATUS_BADGE[v.status] || 'bg-gray-100 text-gray-600'}`}>{v.status}</span>
                    </td>
                    <td className="py-4 px-6 text-gray-700">{v.provisionedVia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={victimsPageSize} total={victimsTotal} onChange={setPage} />
        </div>
        )}
      </div>
    </MinistryLayout>
  );
}
