import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/apiClient';
import { setToken } from '../services/auth';
import { User, Lock, MessageSquare, BarChart3, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../context/ToastContext';

// The one deliberate exception to "every role gets its own copy, no shared
// imports" - this is a pre-role entry point (Counsellor / Administration /
// Data Operator all sign in here before the app knows which role folder to
// route into), and the user explicitly asked for it to keep working exactly
// as it does today. Left byte-for-byte identical to the original
// pages/staff/Login.jsx, only its file location changed.
export default function StaffLogin() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // uiRole can be 'Counsellor', 'Admins', 'Data Operator'
  const [uiRole, setUiRole] = useState('Counsellor');
  // adminLevel can be '', 'National Admin', 'State Admin', 'District Admin'
  const [adminLevel, setAdminLevel] = useState('');
  const [loading, setLoading] = useState(false);

  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [tempToken, setTempToken] = useState(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Enter-to-next-field navigation: refs (not tabIndex + querySelector) since
  // React already gives us direct handles to each field. The final field
  // (password) triggers the real submit button via .click() rather than
  // calling handleSubmit directly, so it goes through the browser's native
  // form validation (the fields' own `required` attributes) and the
  // button's existing `disabled={loading}` guard - no validation duplicated
  // here.
  const adminLevelRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const submitButtonRef = useRef(null);

  const focusOnEnter = (nextRef) => (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef.current?.focus();
    }
  };

  const submitOnEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitButtonRef.current?.click();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Map UI role back to backend expected role - only 'Admins' needs
    // translating now that the Data Operator role is named that everywhere.
    let roleName = uiRole;
    if (uiRole === 'Admins') roleName = 'Administration';

    try {
      const data = await apiClient.post('/api/auth/staff/login', {
        email, password, roleName,
      });

      if (data.mustChangePassword) {
        setRequirePasswordChange(true);
        setTempToken(data.token);
        setLoading(false);
        return;
      }

      await completeLogin(data.token);
    } catch (err) {
      toast.error(err.message);
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
        navigate('/dataoperator');
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
      toast.error(err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      // The backend now invalidates every token issued before this password
      // change, including tempToken itself (that's the whole point of the
      // fix) - it returns a fresh token in the response, which is what has
      // to be used from here on, not the now-invalid tempToken.
      const { token } = await apiClient.post('/api/auth/staff/change-password', { newPassword }, tempToken);
      await completeLogin(token);
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full font-sans overflow-hidden">
      {/* Left Pane - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 xl:px-24 bg-gradient-to-br from-[#3D5A80] to-[#519BCE] text-white h-full relative">
        <div className="mb-12">
          <img src="/logo-3.png" alt="Mansakha" className="h-auto w-64" />
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
                      onClick={() => setUiRole(role)}
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
                        ref={adminLevelRef}
                        value={adminLevel}
                        onChange={(e) => setAdminLevel(e.target.value)}
                        onKeyDown={focusOnEnter(emailRef)}
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        ref={emailRef}
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={focusOnEnter(passwordRef)}
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
                        ref={passwordRef}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={submitOnEnter}
                        required
                        className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-[#519BCE] focus:border-[#519BCE] text-sm text-gray-800 placeholder-gray-400 transition-colors focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    ref={submitButtonRef}
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
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="New Password (min 8 chars)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-[#519BCE] focus:border-[#519BCE] text-sm text-gray-800 placeholder-gray-400 transition-colors focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                        aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      >
                        {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

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
