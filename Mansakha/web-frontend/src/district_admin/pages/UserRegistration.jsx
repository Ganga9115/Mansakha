import React, { useState } from 'react';
import StaffLayout from '../layouts/StaffLayout';
import { Search } from 'lucide-react';
import UserRegistrationForm from '../components/UserRegistrationForm';
import { useMyJurisdiction, useCreateUser, useSearchUserByDocket, useUpdateUser } from '../services/hooks';
import { useToast } from '../../shared/context/ToastContext';

const CASE_STAGE_OPTIONS = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];

// District Admin only - Feature Catalog's User Credential Management.
// State/National Administration don't get this page (no nav item for
// them); a District Admin's own State/District are locked to their own
// jurisdiction, not chosen, since this is *their* district's intake.
export default function UserRegistration() {
  const toast = useToast();
  const { jurisdictionId } = useMyJurisdiction();
  const createUser = useCreateUser();
  const searchUser = useSearchUserByDocket();
  const updateUser = useUpdateUser();

  const [searchDocket, setSearchDocket] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editCaseStage, setEditCaseStage] = useState('');
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
      setEditCaseStage(user.caseStage || '');
    } catch (err) {
      toast.error(err.message || 'Search failed.');
    }
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setEditSuccess(false);
    try {
      await updateUser.mutate(editUser.userId, { caseStage: editCaseStage });
      setEditSuccess(true);
    } catch (err) {
      toast.error(err.message || 'Could not save changes.');
    }
  };

  return (
    <StaffLayout title="User Registration">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <UserRegistrationForm
          lockedJurisdictionId={jurisdictionId}
          lockedJurisdictionLabel="Your district"
          onCreate={createUser.mutate}
          creating={createUser.loading}
        />

        {/* EDIT */}
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
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Case Stage</label>
                <select
                  value={editCaseStage}
                  onChange={(e) => setEditCaseStage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  {CASE_STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
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
