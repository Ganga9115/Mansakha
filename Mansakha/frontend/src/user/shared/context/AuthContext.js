import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Session state - Build Prompt Section 0b: role/jurisdiction are NOT decoded from
// the token client-side and trusted; they're whatever the backend's verifyToken
// middleware re-reads from the DB on each request. The frontend just stores the
// token plus enough identity info (accountType, mustChangePassword) to route.

const AuthContext = createContext(null);
const STORAGE_KEY = 'mansakha_session';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { token, accountType: 'ministry'|'staff'|'user', mustChangePassword? }
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setSession(JSON.parse(raw));
      setIsLoading(false);
    });
  }, []);

  const login = async (sessionData) => {
    setSession(sessionData);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
  };

  const logout = async () => {
    setSession(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    // Web-only nav state persistence (RootNavigator.js's NAV_STATE_STORAGE_KEY)
    // is meant to survive a page RELOAD of the same live session, restoring
    // whatever screen was open - it was never meant to survive a logout. Left
    // uncleared, the next login (even a different person, on a shared device)
    // would land straight back on whatever deep screen (e.g. AI Chat) was
    // open when this session logged out, instead of defaulting to Home -
    // confirmed live. Harmless no-op on native, which doesn't use this key.
    await AsyncStorage.removeItem('mansakha_nav_state');
  };

  const updateSession = async (patch) => {
    const next = { ...session, ...patch };
    setSession(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const value = useMemo(() => ({ session, isLoading, login, logout, updateSession }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
