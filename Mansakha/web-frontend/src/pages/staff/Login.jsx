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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/staff/login', { email, password, roleName });
      setToken(data.token);

      if (roleName === 'Counsellor') {
        navigate('/counsellor');
        return;
      }

      // Administration accounts route to /districtadmin or /stateadmin based
      // on their own jurisdiction level - not a choice made at login, so it's
      // looked up via /api/me rather than picked from the dropdown.
      const me = await apiClient.get('/api/me', data.token);
      const jurisdictionLevel = me.roles?.[0]?.jurisdictionLevel;
      navigate(jurisdictionLevel === 'state' || jurisdictionLevel === 'national' ? '/stateadmin' : '/districtadmin');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-xl font-bold text-gray-800 mb-1">Mansakha Staff Portal</h1>
        <p className="text-sm text-gray-500 mb-6">Counsellor / Administration sign in</p>
        <div className="space-y-4">
          <select
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="Counsellor">Counsellor</option>
            <option value="Administration">Administration</option>
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
    </div>
  );
}
