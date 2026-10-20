import React, { useRef, useState } from 'react';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { apiClient } from '../services/apiClient';
import { getToken } from '../services/auth';
import { useMe } from '../services/hooks';
import { Eye, EyeOff, User } from 'lucide-react';

// Rehabilitation Officer's own copy of the shared Settings/Profile screen -
// mirrors dwo/pages/Profile.jsx (the template), reused as-is:
// /api/auth/staff/change-password and /api/me/profile-photo are both
// role-agnostic (see auth.staff.routes.js's own change-password route,
// which only checks req.auth.type === 'official').
export default function Profile() {
  usePageHeader({ title: 'Profile' });
  const { data: me, refetch: refetchMe } = useMe();
  const fileInputRef = useRef(null);
  const [photoError, setPhotoError] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const handlePhotoSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      await apiClient.uploadFile('/api/me/profile-photo', formData, getToken());
      refetchMe();
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordLoading(true);
    try {
      await apiClient.post('/api/auth/staff/change-password', { newPassword }, getToken());
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setShowPasswordForm(false); setPasswordSuccess(false); }, 1500);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const jobTitle = 'Rehabilitation Officer';

  return (
    <>
      <div className="space-y-6">

        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-gray-800">{jobTitle} Profile</h3>

          <div className="flex items-center gap-4">
            {me?.profileImageUrl ? (
              <img
                src={me.profileImageUrl}
                alt={me?.fullName || 'Profile'}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <User size={28} className="text-brand-900" />
              </div>
            )}
            <div>
              <h4 className="font-bold text-gray-800 text-base">{me?.fullName || 'Loading...'}</h4>
              <p className="text-xs text-gray-500">{jobTitle}</p>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handlePhotoSelected}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="text-xs text-brand-600 font-semibold mt-1 hover:underline disabled:opacity-60"
              >
                {photoUploading ? 'Uploading...' : 'Change Profile Photo'}
              </button>
              {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Work Email</label>
            <input
              type="email"
              value={me?.email || ''}
              readOnly
              className="w-full px-3.5 py-2 bg-brand-50 border border-transparent rounded-lg text-xs text-gray-800 focus:outline-none cursor-not-allowed"
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-5">
          <h3 className="font-bold text-sm text-gray-800">Account Security</h3>

          <div className="space-y-4">
            <button
              onClick={() => setShowPasswordForm((v) => !v)}
              className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition"
            >
              {showPasswordForm ? 'Cancel' : 'Reset Password'}
            </button>

            {showPasswordForm && (
              <div className="p-4 bg-brand-50 rounded-lg space-y-3">
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="New password (min 8 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2 pr-10 border border-gray-300 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2 pr-10 border border-gray-300 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
                {passwordSuccess && <p className="text-xs text-emerald-600">Password updated.</p>}
                <button
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                  className="w-full py-2.5 bg-brand-700 text-white rounded-lg text-xs font-semibold disabled:opacity-60"
                >
                  {passwordLoading ? 'Updating...' : 'Confirm New Password'}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
