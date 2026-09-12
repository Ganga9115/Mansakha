import React, { useRef, useState } from 'react';
import StaffLayout from '../layouts/StaffLayout';
import { apiClient } from '../services/apiClient';
import { getToken } from '../services/auth';
import { useMe } from '../services/hooks';
import { Eye, EyeOff, User, Camera, Mail, Shield, Key, Target, IdCard, ArrowRight } from 'lucide-react';

// Data Operator's own copy of the shared Settings/Profile screen -
// simplified to just Data Operator's own role details.
export default function Settings() {
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

  return (
    <StaffLayout title="Profile">
      <div className="max-w-5xl space-y-6">

        {/* Hero Card */}
        <div className="bg-gradient-to-r from-[#f0f5fa] to-[#e6f0f9] p-6 sm:p-8 rounded-2xl border border-blue-100 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
            <div className="relative shrink-0">
              {me?.profileImageUrl ? (
                <img
                  src={me.profileImageUrl}
                  alt={me?.fullName || 'Profile'}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-white shadow-sm"
                />
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white border-4 border-white shadow-sm flex items-center justify-center shrink-0">
                  <User size={40} className="text-gray-400" />
                </div>
              )}
              
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="absolute bottom-1 right-1 w-8 h-8 bg-[#519BCE] rounded-full flex items-center justify-center text-white border-2 border-white hover:bg-[#3d83b3] transition disabled:opacity-60 shadow-sm"
                title="Change Profile Photo"
              >
                <Camera size={14} />
              </button>
            </div>
            
            <div className="min-w-0">
              <h4 className="font-extrabold text-gray-900 text-xl sm:text-2xl mb-2 truncate">{me?.fullName || 'Loading...'}</h4>
              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-[13px] text-gray-600">
                  <User size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate">Data Operator</span>
                </div>
                <div className="flex items-center gap-2 text-[13px] text-gray-600">
                  <Mail size={14} className="text-gray-400 shrink-0" />
                  <span className="truncate">{me?.email || ''}</span>
                </div>
              </div>
              
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
                className="text-[13px] text-[#519BCE] font-bold hover:underline disabled:opacity-60"
              >
                {photoUploading ? 'Uploading...' : 'Change Profile Photo'}
              </button>
              {me && !me.profileImageUrl && !photoUploading && (
                <p className="text-[11px] text-amber-600 mt-1">You haven't set a profile photo yet.</p>
              )}
              {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-md p-5 rounded-2xl border border-white shadow-sm flex items-center gap-4 w-full md:max-w-sm relative z-10">
             <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
               <User className="text-[#519BCE]" size={20} />
             </div>
             <div>
               <h5 className="font-bold text-[14px] text-gray-800">Data Operator</h5>
               <p className="text-[12px] text-gray-500 leading-snug mt-0.5">Helping build a safer and more supportive community.</p>
             </div>
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center gap-4 border-b border-gray-100 pb-5">
            <div className="w-12 h-12 rounded-xl bg-[#f0f5fa] flex items-center justify-center flex-shrink-0">
              <User className="text-[#3d83b3]" size={24} />
            </div>
            <div>
              <h3 className="font-bold text-[16px] text-gray-800">Data Operator Details</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">Your role and access information</p>
            </div>
          </div>

          <div className="space-y-1">
            <DetailRow icon={<Target size={16} />} label="Scope" value="Not jurisdiction-restricted - can register users into any district" />
            <DetailRow icon={<IdCard size={16} />} label="Operator ID" value={me?.staffId || '-'} />
          </div>
        </div>

        {/* Security Card */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm space-y-6">
          <div className="flex items-center gap-4 border-b border-gray-100 pb-5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Shield className="text-[#519BCE]" size={24} />
            </div>
            <div>
              <h3 className="font-bold text-[16px] text-gray-800">Account Security</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">Keep your account secure</p>
            </div>
          </div>

          {!showPasswordForm ? (
            <div className="bg-[#fafcff] border border-gray-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Key className="text-[#519BCE]" size={18} />
                </div>
                <div>
                  <h5 className="font-bold text-[14px] text-gray-800">Reset Password</h5>
                  <p className="text-[12px] text-gray-500 mt-0.5">Set a new password to keep your account secure.</p>
                </div>
              </div>
              <button
                onClick={() => setShowPasswordForm(true)}
                className="flex items-center justify-center gap-2 px-5 py-2.5 border border-[#519BCE] text-[#519BCE] hover:bg-blue-50 rounded-lg text-sm font-semibold transition whitespace-nowrap bg-white"
              >
                Reset Password <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="p-6 bg-[#fafcff] border border-gray-200 rounded-2xl space-y-5">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-bold text-[14px] text-gray-800 flex items-center gap-2">
                  <Key className="text-[#519BCE]" size={16} /> Reset Password
                </h5>
                <button
                  onClick={() => setShowPasswordForm(false)}
                  className="text-gray-400 hover:text-gray-600 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
              
              <div className="space-y-4 max-w-md">
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="New password (min 8 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#519BCE]/20 focus:border-[#519BCE]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
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
                    className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#519BCE]/20 focus:border-[#519BCE]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              {passwordError && <p className="text-xs text-rose-600">{passwordError}</p>}
              {passwordSuccess && <p className="text-sm font-medium text-emerald-600">Password updated successfully.</p>}
              
              <div className="pt-2">
                <button
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                  className="px-6 py-2.5 bg-[#519BCE] text-white rounded-lg text-sm font-semibold disabled:opacity-60 hover:bg-[#3d83b3] transition"
                >
                  {passwordLoading ? 'Updating...' : 'Confirm New Password'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </StaffLayout>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0 last:pb-0 group">
      <div className="flex items-center gap-3">
        <div className="text-gray-400 group-hover:text-[#519BCE] transition-colors">
          {icon}
        </div>
        <span className="text-[13px] font-medium text-gray-700">{label}</span>
      </div>
      <span className="text-[13px] font-semibold text-gray-800 text-right">{value}</span>
    </div>
  );
}
