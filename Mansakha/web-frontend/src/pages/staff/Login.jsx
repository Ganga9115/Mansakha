import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/apiClient';
import { setToken } from '../../services/auth';
import { User, Lock, MessageSquare, BarChart3, ShieldCheck, IdCard } from 'lucide-react';

// Third required login credential alongside email+password (Feature
// Catalog: every Ministry-provisioned account gets a "State Admin ID" /
// "Counsellor ID" / etc.) - label follows whichever role/level is currently
// selected, since the field itself is the same `staffId` value either way.
function staffIdLabel(uiRole, adminLevel) {
  if (uiRole === 'Counsellor') return 'Counsellor ID';
  if (uiRole === 'Data Operator') return 'Data Intake Admin ID';
  if (adminLevel === 'National Admin') return 'National Admin ID';
  if (adminLevel === 'State Admin') return 'State Admin ID';
  if (adminLevel === 'District Admin') return 'District Admin ID';
  return 'Admin ID';
}

export default function StaffLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [staffId, setStaffId] = useState('');
  // uiRole can be 'Counsellor', 'Admins', 'Data Operator'
  const [uiRole, setUiRole] = useState('Counsellor');
  // adminLevel can be '', 'National Admin', 'State Admin', 'District Admin'
  const [adminLevel, setAdminLevel] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [tempToken, setTempToken] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Map UI role back to backend expected role
    let roleName = uiRole;
    if (uiRole === 'Admins') roleName = 'Administration';
    if (uiRole === 'Data Operator') roleName = 'Data Intake Admin';

    try {
      const data = await apiClient.post('/api/auth/staff/login', { email, password, roleName, staffId });

      if (data.mustChangePassword) {
        setRequirePasswordChange(true);
        setTempToken(data.token);
        setLoading(false);
        return;
      }

      await completeLogin(data.token);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const completeLogin = async (token) => {
    try {
      setToken(token);

      if (uiRole === 'Counsellor') {
        navigate('/counsellor');
        return;
      }

      if (uiRole === 'Data Operator') {
        navigate('/dataintake');
        return;
      }

      const me = await apiClient.get('/api/me', token);
      const jurisdictionLevel = me.roles?.[0]?.jurisdictionLevel;

      // Validate Admin Level dropdown selection
      const expectedLevel = adminLevel === 'National Admin' ? 'national'
        : adminLevel === 'State Admin' ? 'state'
        : adminLevel === 'District Admin' ? 'district'
        : '';

      if (!expectedLevel) {
        throw new Error("Please select your Admin Level from the dropdown.");
      }

      if (jurisdictionLevel !== expectedLevel) {
        throw new Error(`Your account is configured for ${jurisdictionLevel} level, not ${expectedLevel}. Please select the correct Admin Level.`);
      }

      navigate(
        jurisdictionLevel === 'national' ? '/nationaladmin'
          : jurisdictionLevel === 'state' ? '/stateadmin'
          : '/districtadmin'
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      await apiClient.post('/api/auth/staff/change-password', { newPassword }, tempToken);
      await completeLogin(tempToken);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full font-sans overflow-hidden">
      {/* Left Pane - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 xl:px-24 bg-gradient-to-br from-[#3D5A80] to-[#519BCE] text-white h-full relative">
        <div className="mb-12">
          <h1 className="text-5xl font-extrabold mb-3 tracking-tight">Mansakha</h1>
          <p className="text-xl text-blue-100/90 font-light">Mind matters. We're listening.</p>
        </div>

        <div className="space-y-3 max-w-sm">
          {/* Feature 1 */}
          <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm">
            <div className="p-2.5 bg-white/10 rounded-lg shrink-0">
              <MessageSquare className="w-5 h-5 text-blue-50" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm mb-0.5">Confidential Counseling</h3>
              <p className="text-xs text-blue-100/80 leading-snug">Secure and private communications with individuals seeking help.</p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm">
            <div className="p-2.5 bg-white/10 rounded-lg shrink-0">
              <BarChart3 className="w-5 h-5 text-blue-50" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm mb-0.5">Insightful Analytics</h3>
              <p className="text-xs text-blue-100/80 leading-snug">Review comprehensive caseload metrics and intake histories.</p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm">
            <div className="p-2.5 bg-white/10 rounded-lg shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-50" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm mb-0.5">Data Security</h3>
              <p className="text-xs text-blue-100/80 leading-snug">Strict access controls ensuring data integrity across jurisdictions.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Pane - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white p-8 h-full overflow-y-auto">
        <div className="w-full max-w-md my-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-10">
            {!requirePasswordChange ? (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">Welcome Back</h2>
                </div>

                {/* Segmented Control for Roles */}
                <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
                  {['Counsellor', 'Admins', 'Data Operator'].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setUiRole(role);
                        setError(null);
                      }}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                        uiRole === role
                          ? 'bg-white text-[#519BCE] shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {uiRole === 'Admins' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Admin Level</label>
                      <select
                        value={adminLevel}
                        onChange={(e) => setAdminLevel(e.target.value)}
                        required
                        className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-[#519BCE] focus:border-[#519BCE] text-sm text-gray-800 bg-white transition-colors focus:outline-none"
                      >
                        <option value="" disabled>Select Admin Level</option>
                        <option value="National Admin">National Admin</option>
                        <option value="State Admin">State Admin</option>
                        <option value="District Admin">District Admin</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{staffIdLabel(uiRole, adminLevel)}</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <IdCard className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder={staffIdLabel(uiRole, adminLevel)}
                        value={staffId}
                        onChange={(e) => setStaffId(e.target.value)}
                        required
                        className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-[#519BCE] focus:border-[#519BCE] text-sm text-gray-800 placeholder-gray-400 transition-colors focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-[#519BCE] focus:border-[#519BCE] text-sm text-gray-800 placeholder-gray-400 transition-colors focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-[#519BCE] focus:border-[#519BCE] text-sm text-gray-800 placeholder-gray-400 transition-colors focus:outline-none"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#519BCE] hover:bg-[#4686b3] text-white py-3 rounded-lg text-sm font-semibold shadow-sm shadow-[#519BCE]/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 mt-2"
                  >
                    {loading ? 'Signing In...' : 'Sign In'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">Change Password</h2>
                  <p className="text-sm text-gray-500">As a new user, you must change your temporary password before accessing the portal.</p>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="password"
                        placeholder="New Password (min 8 chars)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-[#519BCE] focus:border-[#519BCE] text-sm text-gray-800 placeholder-gray-400 transition-colors focus:outline-none"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg text-sm font-semibold shadow-sm shadow-emerald-600/30 transition disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                  >
                    {loading ? 'Updating...' : 'Update & Continue'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
