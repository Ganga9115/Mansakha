import React, { useRef, useState } from 'react';
import StaffLayout from '../../../layouts/StaffLayout';
import { apiClient } from '../../../services/apiClient';
import { getToken } from '../../../services/auth';
import { useMe } from '../../../services/hooks';
import { Eye, EyeOff, User } from 'lucide-react';
import { useToast } from '../../../context/ToastContext';

// This Settings/Profile screen is shared across every Staff role (Counsellor,
// District/State/National Administration, Data Operator) - it used to
// hardcode "Counsellor Profile Matrix"/"Senior Counsellor" regardless of who
// was actually logged in, so every non-Counsellor role saw the wrong job
// title on their own profile. Derived from /api/me's roles[0] instead.
function roleLabels(role) {
  if (!role) return { matrixTitle: 'Staff Profile Matrix', jobTitle: 'Staff' };
  if (role.roleName === 'Administration') {
    const byLevel = { national: 'National Administrator', state: 'State Administrator', district: 'District Administrator' };
    const jobTitle = byLevel[role.jurisdictionLevel] || 'Administrator';
    return { matrixTitle: `${jobTitle} Profile Matrix`, jobTitle };
  }
  if (role.roleName === 'Counsellor') return { matrixTitle: 'Counsellor Profile Matrix', jobTitle: 'Senior Counsellor' };
  if (role.roleName === 'Data Operator') return { matrixTitle: 'Data Operator Profile Matrix', jobTitle: 'Data Operator' };
  return { matrixTitle: `${role.roleName} Profile Matrix`, jobTitle: role.roleName };
}

// Layout defaults to StaffLayout (every existing caller - Counsellor,
// District/State/National Admin, Data Operator); Ministry reuses this same
// profile content but under its own MinistryLayout chrome (different sidebar/
// header), passed in explicitly rather than importing it here and coupling
// this "shared" component to one specific role's layout.
export default function Settings({ onNavigate, Layout = StaffLayout }) {
  const toast = useToast();
  const { data: me, refetch: refetchMe } = useMe();
  const { matrixTitle, jobTitle } = roleLabels(me?.roles?.[0]);
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
      // Real backend failure (e.g. current session/token issue) - a whole-
      // action-failed case, unlike the two client-side checks above which
      // stay inline since they're field-level ("min 8 chars", "must match").
      toast.error(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Layout title="Profile" activePage="Profile" onNavigate={onNavigate}>
      <div className="space-y-6 max-w-5xl">
        
        {/* COUNSELLOR PROFILE MATRIX */}
        <div className="bg-white p-6 rounded-xl border border-gray-200/80 shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-gray-800">{matrixTitle}</h3>
          
          <div className="flex items-center gap-4">
            {me?.profileImageUrl ? (
              <img
                src={me.profileImageUrl}
                alt={me?.fullName || 'Profile'}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#EBF4FA] border border-[#D6E8F5] flex items-center justify-center shrink-0">
                <User size={28} className="text-[#3D5A80]" />
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
                className="text-xs text-[#519BCE] font-semibold mt-1 hover:underline disabled:opacity-60"
              >
                {photoUploading ? 'Uploading...' : 'Change Profile Photo'}
              </button>
              {me && !me.profileImageUrl && !photoUploading && (
                <p className="text-[11px] text-amber-600 mt-1">You haven't set a profile photo yet.</p>
              )}
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
                  className="w-full py-2.5 bg-[#519BCE] text-white rounded-lg text-xs font-semibold disabled:opacity-60"
                >
                  {passwordLoading ? 'Updating...' : 'Confirm New Password'}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </Layout>
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