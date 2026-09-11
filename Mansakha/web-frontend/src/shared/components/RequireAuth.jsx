import React from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '../services/auth';

// Redirects to the given login route if there's no stored token. Only
// checks token presence, not validity - an expired/invalid token still
// reaches the page, which then fails its own API calls and surfaces that
// error normally (no separate "verify token" round trip needed here).
export default function RequireAuth({ children, loginPath = '/login' }) {
  if (!isAuthenticated()) return <Navigate to={loginPath} replace />;
  return children;
}
