import React from 'react';

export default function StaffLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="w-full max-w-sm bg-white rounded-lg shadow-sm p-8">
        <h1 className="text-xl font-bold text-gray-800 mb-1">Mansakha Staff Portal</h1>
        <p className="text-sm text-gray-500 mb-6">Counsellor / Administration sign in</p>
        <div className="space-y-4">
          <input type="text" placeholder="Email" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <input type="password" placeholder="Password" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <button type="button" className="w-full bg-[#519BCE] text-white py-2 rounded-md text-sm font-medium">Sign in</button>
        </div>
      </div>
    </div>
  );
}
