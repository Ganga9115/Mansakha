import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/apiClient';
import { setToken } from '../services/auth';
import { User, Lock, HeartHandshake, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import GlideSelect from '../components/GlideSelect';

// Demo sign-in shortcuts, same idea as the victim app's pre-filled docket -
// keyed by the role currently selected in the dropdown below, all sharing
// the one demo password reset across these accounts.
const ROLE_CREDENTIALS = {
  'Protection Officer': { identifier: 'porbandarsadarpolicestation.po.gu@mansakha.gov.in', password: 'Mansakha@2026' },
  'District Welfare Officer': { identifier: 'dwo.porbandar.gu@mansakha.gov.in', password: 'Mansakha@2026' },
  'DLSA Coordinator': { identifier: 'dlsa.porbandar.gu@mansakha.gov.in', password: 'Mansakha@2026' },
  'Rehabilitation Officer': { identifier: 'porbandar.ro.gu@mansakha.gov.in', password: 'Mansakha@2026' },
  'Investigating Officer': { identifier: 'porbandarsadarpolicestation.io.gu@mansakha.gov.in', password: 'Mansakha@2026' },
  'Public Prosecutor': { identifier: 'diyareddy.pp-521@mansakha.gov.in', password: 'Mansakha@2026' },
};

// The second deliberate "shared page" exception (see Login.jsx's own header
// comment for the first) - a pre-role entry point for the coordination
// roles (District Welfare Officer, Investigating Officer, Protection
// Officer, DLSA Coordinator, Rehabilitation Officer, Public Prosecutor),
// kept as its own page rather than extending Login.jsx's segmented control,
// same reasoning the backend's auth.signin.routes.js uses for being its own
// file rather than widening auth.staff.routes.js. Posts to
// /api/auth/signin/login; structurally mirrors Login.jsx otherwise.
// Special Public Prosecutor stays retired (absorbed into DLSA Coordinator);
// District Collector is retired too (SLA-escalation destination dropped
// entirely, not redirected). Investigating Officer is REINSTATED
// (migration_033, see backend/server.js's own comment on the same change)
// with real substance - station-scoped, its own investigation_records.
const SIGNIN_ROLES = [
  'Investigating Officer',
  'District Welfare Officer',
  'Protection Officer',
  'DLSA Coordinator',
  'Rehabilitation Officer',
  'Public Prosecutor',
];

const ROLE_HOME_PATH = {
  'Investigating Officer': '/io',
  'District Welfare Officer': '/dwo',
  'Protection Officer': '/protectionofficer',
  'DLSA Coordinator': '/dlsa',
  'Rehabilitation Officer': '/rehabilitationofficer',
  'Public Prosecutor': '/legalrepresentative',
};

export default function SignIn() {
  const navigate = useNavigate();
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [roleName, setRoleName] = useState(SIGNIN_ROLES[0]);
  const [loading, setLoading] = useState(false);

  // Re-fill the demo credentials whenever the selected role changes, so the
  // Role dropdown always shows a working default for that role instead of
  // stale creds left over from the previous selection.
  useEffect(() => {
    const creds = ROLE_CREDENTIALS[roleName];
    setIdentifier(creds?.identifier || '');
    setPassword(creds?.password || '');
  }, [roleName]);

  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [tempToken, setTempToken] = useState(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

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
    try {
      const data = await apiClient.post('/api/auth/signin/login', { identifier, password, roleName });

      if (data.mustChangePassword) {
        setRequirePasswordChange(true);
        setTempToken(data.token);
        setLoading(false);
        return;
      }

      completeLogin(data.token);
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  const completeLogin = (token) => {
    setToken(token);
    navigate(ROLE_HOME_PATH[roleName]);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      // Reuses the existing, role-agnostic /api/auth/staff/change-password -
      // it only checks req.auth.type === 'official', so it already works
      // for these accounts unmodified. Same reasoning as
      // auth.signin.routes.js not duplicating this route.
      const { token } = await apiClient.post('/api/auth/staff/change-password', { newPassword }, tempToken);
      completeLogin(token);
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full font-sans overflow-hidden">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 xl:px-24 bg-gradient-to-br from-brand-900 to-brand-800 text-white h-full relative">
        <div className="mb-12">
          <img src="/logo-3.png" alt="Mansakha" className="h-auto w-64" />
        </div>

        <div className="space-y-3 max-w-sm">
          <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm">
            <div className="p-2.5 bg-white/10 rounded-lg shrink-0">
              <HeartHandshake className="w-5 h-5 text-brand-50" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm mb-0.5">Agency Coordination</h3>
              <p className="text-xs text-brand-100/80 leading-snug">Work the referrals a District Admin sends your agency for a case they've already reviewed.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white p-8 h-full overflow-y-auto">
        <div className="w-full max-w-md my-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-10">
            {!requirePasswordChange ? (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">Sign In</h2>
                  <p className="text-sm text-gray-400 mt-1">Coordination roles portal</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <GlideSelect
                      options={SIGNIN_ROLES}
                      value={roleName}
                      onChange={(val) => setRoleName(val)}
                      ariaLabel="Role"
                      menuWidth={280}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email or Staff ID</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        ref={emailRef}
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        onKeyDown={focusOnEnter(passwordRef)}
                        required
                        autoComplete="username"
                        className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-brand-800 focus:border-brand-800 text-sm text-gray-800 placeholder-gray-400 transition-colors focus:outline-none"
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
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={submitOnEnter}
                        required
                        className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-brand-800 focus:border-brand-800 text-sm text-gray-800 placeholder-gray-400 transition-colors focus:outline-none"
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
                    className="w-full bg-brand-900 hover:bg-brand-800 text-white py-3 rounded-lg text-sm font-semibold shadow-sm shadow-brand-900/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 mt-2"
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
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-brand-800 focus:border-brand-800 text-sm text-gray-800 placeholder-gray-400 transition-colors focus:outline-none"
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
