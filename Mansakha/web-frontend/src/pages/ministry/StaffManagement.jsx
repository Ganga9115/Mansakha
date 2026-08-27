import React, { useState } from 'react';
import MinistryLayout from '../../layouts/MinistryLayout';
import { UserPlus, X } from 'lucide-react';
import { useStaffList, useCreateStaff, useRevokeStaff, useJurisdictionOptions } from '../../services/hooks';

const ROLE_OPTIONS = ['Counsellor', 'Administration', 'Data Operator'];
const JURISDICTION_LEVELS = ['district', 'state', 'national'];

const STATUS_BADGE = {
  active: 'bg-emerald-100 text-emerald-700',
  revoked: 'bg-gray-100 text-gray-500',
};

export default function StaffManagement() {
  const { data, loading, error, refetch } = useStaffList();
  const createStaff = useCreateStaff();
  const revokeStaff = useRevokeStaff();

  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [roleName, setRoleName] = useState('Counsellor');
  const [jurisdictionLevel, setJurisdictionLevel] = useState('district');
  const [jurisdictionId, setJurisdictionId] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState(null);

  const jurisdictionQuery = useJurisdictionOptions(
    roleName === 'Administration' ? jurisdictionLevel : undefined
  );
  const jurisdictionOptions = jurisdictionQuery.data?.jurisdictions || [];

  const staff = data?.staff || [];

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError(null);
    try {
      await createStaff.mutate({
        fullName: fullName.trim(),
        email: email.trim(),
        roleName,
        password,
        jurisdictionId: roleName === 'Administration' ? jurisdictionId : undefined,
      });
      setShowForm(false);
      setFullName('');
      setEmail('');
      setPassword('');
      setJurisdictionId('');
      refetch();
    } catch (err) {
      // e.g. the 1-per-district/state limit rejection - surfaced inline,
      // not as a generic toast, so it's clear exactly what to change.
      setFormError(err.message || 'Could not create this account.');
    }
  };

  const handleRevoke = async (officialId) => {
    if (!window.confirm('Revoke this account? They will no longer be able to sign in.')) return;
    await revokeStaff.mutate(officialId);
    refetch();
  };

  return (
    <MinistryLayout title="Staff Management">
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            {showForm ? <X size={14} /> : <UserPlus size={14} />}
            {showForm ? 'Cancel' : 'Create Account'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Role</label>
              <select value={roleName} onChange={(e) => setRoleName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Temporary Password</label>
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Required" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
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
            {formError && <p className="col-span-2 text-xs text-rose-600">{formError}</p>}
            <div className="col-span-2">
              <button type="submit" disabled={createStaff.loading} className="px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60">
                {createStaff.loading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        )}

        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#EBF4FA]/60 text-gray-600 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                  <th className="py-3.5 px-6">Name</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Jurisdiction</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {loading ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">Loading...</td></tr>
                ) : error ? (
                  <tr><td colSpan={5} className="py-8 text-center text-rose-600">{error}</td></tr>
                ) : staff.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-400">No staff accounts yet.</td></tr>
                ) : staff.map((s) => (
                  <tr key={s.officialId} className="hover:bg-gray-50/70 transition">
                    <td className="py-4 px-6 font-bold text-gray-800">{s.fullName}</td>
                    <td className="py-4 px-4 text-gray-700 font-medium">{s.roleName}</td>
                    <td className="py-4 px-4 text-gray-700">{s.jurisdictionName || '-'}</td>
                    <td className="py-4 px-4">
                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${STATUS_BADGE[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {s.status !== 'revoked' && (
                        <button
                          onClick={() => handleRevoke(s.officialId)}
                          className="px-3 py-1.5 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded-md text-xs font-medium transition"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MinistryLayout>
  );
}
