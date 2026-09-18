import React, { useState } from 'react';
import StaffLayout from '../layouts/StaffLayout';
import { Search } from 'lucide-react';
import { useSearchUserByDocket, useUpdateUser } from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

// migration_034: Case Stage is no longer editable by District Admin (or any
// staff role) - it's read-only here, shown exactly as eCourt (simulated,
// core/services/ecourtStageSync.js) reports it. This panel edits the two
// fields District Admin's own PATCH /users/:userId still accepts - contact
// number and address.
const CASE_STAGE_TONE = {
  Investigation: 'bg-amber-50 text-amber-700',
  Trial: 'bg-blue-50 text-blue-700',
  Rehabilitation: 'bg-violet-50 text-violet-700',
  Compensation: 'bg-teal-50 text-teal-700',
  'Case Closed': 'bg-gray-100 text-gray-600',
};

// District Admin only - Feature Catalog Section 3.5 "Edit user record".
// User CREATION was removed from this role entirely (Data Operator is the
// sole intake/registration authority - dataoperator/pages's own "Register
// User") to match the PS's own division of labor: District Administration
// oversees and corrects records, it doesn't do front-desk registration.
export default function EditUserRecord() {
  const toast = useToast();
  const searchUser = useSearchUserByDocket();
  const updateUser = useUpdateUser();

  const [searchDocket, setSearchDocket] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editContactNumber, setEditContactNumber] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    setEditUser(null);
    setEditSuccess(false);
    if (!searchDocket.trim()) return;
    try {
      const result = await searchUser.mutate(searchDocket.trim());
      const user = result?.user;
      if (!user) {
        toast.error('No user found with that docket number.');
        return;
      }
      setEditUser(user);
      setEditContactNumber(user.contactNumber || '');
      setEditAddress(user.address || '');
    } catch (err) {
      toast.error(err.message || 'Search failed.');
    }
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setEditSuccess(false);
    try {
      await updateUser.mutate(editUser.userId, { contactNumber: editContactNumber, address: editAddress });
      setEditSuccess(true);
    } catch (err) {
      toast.error(err.message || 'Could not save changes.');
    }
  };

  return (
    <StaffLayout title="Edit User Record">
      <div className="max-w-lg">
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-gray-800">Edit User Record</h3>

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
              disabled={searchUser.loading}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-60"
            >
              <Search size={16} />
            </button>
          </form>

          {editUser && (
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase block">Full Name</span>
                <span className="text-sm font-semibold text-gray-800">{editUser.fullName}</span>
              </div>
              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Case Stage</span>
                <span className={`inline-block px-2 py-1 rounded-full text-[11px] font-semibold ${CASE_STAGE_TONE[editUser.caseStage] || 'bg-gray-100 text-gray-600'}`}>
                  {editUser.caseStage || 'Unknown'}
                </span>
                <p className="text-[10px] text-gray-400 mt-1">Set exclusively by the eCourt system - not editable here.</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Contact Number</label>
                <input
                  type="text"
                  value={editContactNumber}
                  onChange={(e) => setEditContactNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Address</label>
                <textarea
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              {editSuccess && <p className="text-xs text-emerald-600">Saved.</p>}
              <button
                onClick={handleSaveEdit}
                disabled={updateUser.loading}
                className="w-full px-4 py-2.5 bg-[#519BCE] hover:bg-[#3d83b3] text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
              >
                {updateUser.loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </StaffLayout>
  );
}
