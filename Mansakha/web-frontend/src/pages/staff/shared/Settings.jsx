import React, { useRef, useState } from 'react';
import StaffLayout from '../../../layouts/StaffLayout';
import { apiClient } from '../../../services/apiClient';
import { getToken } from '../../../services/auth';
import { useMe } from '../../../services/hooks';

const FALLBACK_PHOTO = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100';

export default function Settings({ onNavigate }) {
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

  const [toggles, setToggles] = useState({
    aiFlag: true,
    criticalEscalation: true,
    caseUpdates: false,
    compactView: false,
    stealthTunnel: true,
  });

  const handleToggle = (key) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    <StaffLayout title="System Configuration & Preferences" activePage="Settings" onNavigate={onNavigate}>
      <div className="space-y-6 max-w-5xl">
        
        {/* COUNSELLOR PROFILE MATRIX */}
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-gray-800">Counsellor Profile Matrix</h3>
          
          <div className="flex items-center gap-4">
            <img
              src={me?.profileImageUrl || FALLBACK_PHOTO}
              alt={me?.fullName || 'Profile'}
              className="w-16 h-16 rounded-full object-cover"
            />
            <div>
              <h4 className="font-bold text-gray-800 text-base">{me?.fullName || 'Loading...'}</h4>
              <p className="text-xs text-gray-500">Senior Counsellor</p>
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
                className="text-xs text-[#519BCE] font-semibold mt-1 hover:underline disabled:opacity-60"
              >
                {photoUploading ? 'Uploading...' : 'Change Profile Photo'}
              </button>
              {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Verification Work Email</label>
            <input
              type="email"
              value={me?.email || ''}
              readOnly
              className="w-full px-3.5 py-2 bg-[#F8F9FA] border border-transparent rounded-lg text-xs text-gray-800 focus:outline-none cursor-not-allowed"
            />
          </div>
        </div>

        {/* TELEMETRY ALERT ROUTINGS */}
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-5">
          <h3 className="font-bold text-sm text-gray-800">Telemetry Alert Routings</h3>

          <ToggleRow 
            title="High Risk AI Flag Signals"
            subtitle="Push notification immediate dispatch"
            enabled={toggles.aiFlag}
            onToggle={() => handleToggle('aiFlag')}
          />

          <ToggleRow 
            title="Critical Severity Escalation"
            subtitle="Stealth emergency SMS pathway"
            enabled={toggles.criticalEscalation}
            onToggle={() => handleToggle('criticalEscalation')}
          />

          <ToggleRow 
            title="Assigned Case Update Changes"
            subtitle="Standard daily briefing alert"
            enabled={toggles.caseUpdates}
            onToggle={() => handleToggle('caseUpdates')}
          />
        </div>

        {/* AI FLAG THRESHOLD SETTINGS */}
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-5">
          <h3 className="font-bold text-sm text-gray-800">AI Flag Threshold Settings</h3>

          <div>
            <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
              <span>High Risk Severity Trigger Score</span>
              <span>70/100</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: '70%' }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
              <span>Critical Level Emergency Sequence Alert</span>
              <span>85/100</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-red-600 rounded-full" style={{ width: '85%' }}></div>
            </div>
          </div>
        </div>

        {/* SYSTEM SECURITY PARAMETERS */}
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-5">
          <h3 className="font-bold text-sm text-gray-800">System Security Parameters</h3>

          <ToggleRow 
            title="Compact View Mode"
            subtitle="Minimize dashboard grid footprint"
            enabled={toggles.compactView}
            onToggle={() => handleToggle('compactView')}
          />

          <ToggleRow 
            title="Stealth Safety Tunnel (SSO)"
            subtitle="Enable encrypted clinical pathway access"
            enabled={toggles.stealthTunnel}
            onToggle={() => handleToggle('stealthTunnel')}
          />

          <div className="pt-4 border-t border-gray-100 space-y-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowPasswordForm((v) => !v)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition"
              >
                {showPasswordForm ? 'Cancel' : 'Reset Password'}
              </button>
              <button
                className="flex-1 py-2.5 bg-[#519BCE] text-white rounded-lg text-xs font-semibold opacity-50 cursor-not-allowed"
                disabled
                title="Not backed by any real setting yet"
              >
                Apply Policy Updates
              </button>
            </div>

            {showPasswordForm && (
              <div className="p-4 bg-[#F8F9FA] rounded-lg space-y-3">
                <input
                  type="password"
                  placeholder="New password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs"
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-xs"
                />
                {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
                {passwordSuccess && <p className="text-xs text-emerald-600">Password updated.</p>}
                <button
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                  className="w-full py-2.5 bg-[#519BCE] text-white rounded-lg text-xs font-semibold disabled:opacity-60"
                >
                  {passwordLoading ? 'Updating...' : 'Confirm New Password'}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </StaffLayout>
  );
}

function ToggleRow({ title, subtitle, enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-bold text-gray-800">{title}</p>
        <p className="text-[11px] text-gray-400">{subtitle}</p>
      </div>
      <button 
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          enabled ? 'bg-[#519BCE]' : 'bg-gray-200'
        }`}
      >
        <span 
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}