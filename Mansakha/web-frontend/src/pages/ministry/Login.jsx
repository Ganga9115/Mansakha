import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/apiClient';
import { setToken } from '../../services/auth';
import { Settings, Users, Map, User, Lock, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export default function MinistryLogin() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiClient.post('/api/auth/ministry/login', { email, password });
      setToken(data.token);
      navigate('/ministry/dashboard');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full font-sans">
      {/* Left Pane - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 xl:px-24 bg-gradient-to-br from-[#3D5A80] to-[#519BCE] text-white">
        <div className="mb-12">
          <h1 className="text-5xl font-extrabold mb-3 tracking-tight">Mansakha</h1>
          <p className="text-xl text-blue-100/90 font-light">Mind matters. We're listening.</p>
        </div>

        <div className="space-y-3 max-w-sm">
          {/* Feature 1 */}
          <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm">
            <div className="p-2.5 bg-white/10 rounded-lg shrink-0">
              <Users className="w-5 h-5 text-blue-50" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm mb-0.5">Staff Management</h3>
              <p className="text-xs text-blue-100/80 leading-snug">Provision and manage official accounts across all jurisdictions.</p>
            </div>
          </div>
          
          {/* Feature 2 */}
          <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm">
            <div className="p-2.5 bg-white/10 rounded-lg shrink-0">
              <Settings className="w-5 h-5 text-blue-50" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm mb-0.5">System Configuration</h3>
              <p className="text-xs text-blue-100/80 leading-snug">Configure languages, case types, and interaction channels globally.</p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex items-center gap-4 p-3.5 rounded-xl bg-white/10 border border-white/10 backdrop-blur-sm">
            <div className="p-2.5 bg-white/10 rounded-lg shrink-0">
              <Map className="w-5 h-5 text-blue-50" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm mb-0.5">National Analytics & Audits</h3>
              <p className="text-xs text-blue-100/80 leading-snug">Track platform usage geographically and review immutable audit logs.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Pane - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 sm:p-10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Ministry Signin</h2>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
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
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                type="submit"
                disabled={loading}
                className="w-full bg-[#519BCE] hover:bg-[#4686b3] text-white py-3 rounded-lg text-sm font-semibold shadow-sm shadow-[#519BCE]/30 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 mt-2"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
