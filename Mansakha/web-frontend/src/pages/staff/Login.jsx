import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/apiClient';
import { setToken } from '../../services/auth';

export default function StaffLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleName, setRoleName] = useState('Counsellor');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [tempToken, setTempToken] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/staff/login', { email, password, roleName });
      
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

      if (roleName === 'Counsellor') {
        navigate('/counsellor');
        return;
      }

      if (roleName === 'Data Intake Admin') {
        navigate('/dataintake');
        return;
      }

      const me = await apiClient.get('/api/me', token);
      const jurisdictionLevel = me.roles?.[0]?.jurisdictionLevel;
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
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      {!requirePasswordChange ? (
        <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-xl font-bold text-gray-800 mb-1">Mansakha Staff Portal</h1>
          <p className="text-sm text-gray-500 mb-6">Counsellor / Administration / Data Intake sign in</p>
          <div className="space-y-4">
            <select
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
            >
              <option value="Counsellor">Counsellor</option>
              <option value="Administration">Administration</option>
              <option value="Data Intake Admin">Data Intake Admin</option>
            </select>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#519BCE] text-white py-2 rounded-md text-sm font-medium disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleChangePassword} className="w-full max-w-sm bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-xl font-bold text-gray-800 mb-1">Change Password</h1>
          <p className="text-sm text-gray-500 mb-6">As a new user, you must change your temporary password before accessing the portal.</p>
          <div className="space-y-4">
            <input
              type="password"
              placeholder="New Password (min 8 chars)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-md text-sm font-medium transition disabled:opacity-60"
            >
              {loading ? 'Updating...' : 'Update & Continue'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
