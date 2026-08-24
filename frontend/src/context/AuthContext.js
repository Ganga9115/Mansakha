import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Session state - Build Prompt Section 0b: role/jurisdiction are NOT decoded from
// the token client-side and trusted; they're whatever the backend's verifyToken
// middleware re-reads from the DB on each request. The frontend just stores the
// token plus enough identity info (accountType, mustChangePassword) to route.

const AuthContext = createContext(null);
const STORAGE_KEY = 'mansakha_session';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { token, accountType: 'ministry'|'staff'|'victim', mustChangePassword? }
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
