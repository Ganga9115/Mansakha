import React, { useRef, useState } from 'react';
import { usePageHeader } from '../../shared/context/PageHeaderContext';
import { apiClient } from '../services/apiClient';
import { getToken } from '../services/auth';
import { useMe } from '../services/hooks';
import { Eye, EyeOff, User, Camera, Mail, MapPin, Landmark, Shield, Key, Pencil, ArrowRight, BadgeCheck } from 'lucide-react';

// District Admin's own copy of the shared Settings/Profile screen -
// simplified to just Administration's own role details.
export default function Settings() {
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

  const role = me?.roles?.[0];
  const jobTitle = 'District Administrator';

  return (
    <>
      <div className="space-y-6 max-w-5xl">

        {/* Hero Card */}
        <div className="relative bg-gradient-to-r from-[#f2f3fa] to-[#e2e3f4] rounded-2xl border border-brand-100 shadow-sm overflow-hidden p-6 flex flex-col md:flex-row md:items-start justify-between gap-6">
          {/* Watermark Icon */}
          <Landmark size={140} className="absolute right-1/3 top-1/2 -translate-y-1/2 text-brand-200/40 pointer-events-none" />

          {/* Left section: Avatar and Info */}
          <div className="flex items-center gap-6 relative z-10">
            <div className="relative">
              {me?.profileImageUrl ? (
                <img
                  src={me.profileImageUrl}
                  alt={me?.fullName || 'Profile'}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-sm"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-white text-[#1e224f] font-bold text-3xl flex items-center justify-center border-4 border-white shadow-sm shrink-0">
                  {me?.fullName ? me.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'DA'}
                </div>
              )}
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="absolute bottom-0 right-0 w-8 h-8 bg-[#1e224f] hover:bg-[#1a1d45] text-white rounded-full flex items-center justify-center border-2 border-white shadow-sm transition-colors"
                title="Change Profile Photo"
              >
                <Camera size={14} />
              </button>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handlePhotoSelected}
                className="hidden"
              />
            </div>
            
            <div className="space-y-1">
              <h2 className="text-xl font-extrabold text-[#1a1d45]">{me?.fullName || 'Loading...'}</h2>
              <p className="text-[13px] font-medium text-gray-600">{jobTitle}</p>
              <div className="flex items-center gap-1.5 text-gray-500 mt-1">
                <Mail size={14} />
                <span className="text-[13px]">{me?.email || 'district.admin@mansakha.gov.in'}</span>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="text-[12px] font-bold text-[#1e224f] hover:underline mt-2 inline-block disabled:opacity-60"
              >
                {photoUploading ? 'Uploading...' : 'Change Profile Photo'}
              </button>
              {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
            </div>
          </div>

          {/* Right section: Jurisdiction Box */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-brand-50/50 w-full md:w-64 shrink-0 relative z-10">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Jurisdiction</span>
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={16} className="text-[#1e224f]" />
              <span className="text-[14px] font-extrabold text-[#1a1d45]">
                {role?.jurisdictionName ? `${role.jurisdictionName} (District)` : 'Pune (District)'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Overseeing cases and coordination across the district.
            </p>
          </div>
        </div>

        {/* Administration Details */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-brand-50 text-[#1e224f] rounded-xl flex items-center justify-center shrink-0">
                <BadgeCheck size={24} />
              </div>
              <div>
                <h3 className="text-[16px] font-extrabold text-[#1a1d45]">Administration Details</h3>
                <p className="text-[13px] text-gray-500 mt-0.5">Your role and access information.</p>
              </div>
            </div>
            <button className="px-4 py-2 border border-gray-200 text-[#1e224f] rounded-lg text-xs font-bold hover:bg-brand-50 transition-colors flex items-center gap-2 self-start md:self-auto">
              <Pencil size={12} /> Edit Details
            </button>
          </div>
          
          <div className="p-6 space-y-0">
            <DetailRow label="Jurisdiction" value={role?.jurisdictionName ? `${role.jurisdictionName} (District)` : 'Pune (District)'} />
            <DetailRow label="Admin ID" value={me?.staffId || '1'} />
          </div>
        </div>

        {/* Account Security */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center shrink-0">
              <Shield size={24} />
            </div>
            <div>
              <h3 className="text-[16px] font-extrabold text-[#1a1d45]">Account Security</h3>
              <p className="text-[13px] text-gray-500 mt-0.5">Keep your account secure.</p>
            </div>
          </div>
          
          <div className="px-6 pb-6">
            <div className="bg-[#f8fafc] rounded-xl p-5 border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 text-[#1e224f] flex items-center justify-center shrink-0 mt-0.5">
                  <Key size={14} />
                </div>
                <div>
                  <h4 className="text-[14px] font-bold text-gray-800">Password</h4>
                  <p className="text-[12px] text-gray-500 mt-0.5">Update your password regularly to keep your account secure.</p>
                </div>
              </div>
              
              <div className="flex flex-col gap-2 min-w-[200px]">
                <button
                  onClick={() => setShowPasswordForm((v) => !v)}
                  className="px-5 py-2.5 bg-[#1e224f] hover:bg-[#1a1d45] text-white rounded-lg text-[13px] font-bold transition-colors flex items-center justify-center gap-2 w-full md:w-auto"
                >
                  {showPasswordForm ? 'Cancel' : 'Reset Password'} {showPasswordForm ? null : <ArrowRight size={14} />}
                </button>
              </div>
            </div>

            {/* Expanded Password Form */}
            {showPasswordForm && (
              <div className="mt-4 p-5 bg-white border border-gray-200 rounded-xl space-y-4 max-w-md ml-auto">
                <h4 className="text-[14px] font-bold text-gray-800 border-b border-gray-100 pb-2">Change Password</h4>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="New password (min 8 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-[#1e224f] focus:ring-1 focus:ring-[#1e224f]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-10 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-[#1e224f] focus:ring-1 focus:ring-[#1e224f]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordError && <p className="text-xs text-red-600 font-medium">{passwordError}</p>}
                {passwordSuccess && <p className="text-xs text-emerald-600 font-medium">Password updated successfully.</p>}
                <button
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                  className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-60 mt-2"
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

function DetailRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-4 border-b border-gray-100 last:border-0">
      <span className="text-[13px] font-semibold text-gray-500 w-1/3">{label}</span>
      <span className="text-[14px] font-bold text-gray-800 flex-1 sm:text-right">{value}</span>
    </div>
  );
}
