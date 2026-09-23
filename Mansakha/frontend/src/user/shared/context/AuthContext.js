import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Session state - Build Prompt Section 0b: role/jurisdiction are NOT decoded from
// the token client-side and trusted; they're whatever the backend's verifyToken
// middleware re-reads from the DB on each request. The frontend just stores the
// token plus enough identity info (accountType, mustChangePassword) to route.

const AuthContext = createContext(null);
const STORAGE_KEY = 'mansakha_session';
const NAV_STATE_KEY = 'mansakha_nav_state';
const isWeb = Platform.OS === 'web';

// Same reasoning as RootNavigator.js's own NAV_STATE_STORAGE_KEY comment:
// AsyncStorage is localStorage on web, which is shared across every tab of
// the same origin - so on the web build, logging in as one victim in a
// second tab silently overwrote whichever victim was signed in on the first
// tab (confirmed the same way the nav-state bug was). window.sessionStorage
// is isolated per tab, so each tab keeps its own session. Native is
// untouched - AsyncStorage there is already sandboxed per device/install,
// one victim per physical phone, no cross-tab sharing to worry about.
async function sessionGet(key) {
  return isWeb ? window.sessionStorage.getItem(key) : AsyncStorage.getItem(key);
}
async function sessionSet(key, value) {
  if (isWeb) { window.sessionStorage.setItem(key, value); return; }
  return AsyncStorage.setItem(key, value);
}
async function sessionRemove(key) {
  if (isWeb) { window.sessionStorage.removeItem(key); return; }
  return AsyncStorage.removeItem(key);
}

// RootNavigator.js deliberately keeps this key in per-tab sessionStorage, not
// AsyncStorage (localStorage on web, shared across every tab of the same
// origin) - see that file for why. Login/logout need to clear the exact same
// storage the navigator itself reads, or clearing here would silently no-op.
function clearNavState() {
  if (Platform.OS === 'web') window.sessionStorage.removeItem(NAV_STATE_KEY);
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { token, accountType: 'ministry'|'staff'|'user', mustChangePassword? }
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    sessionGet(STORAGE_KEY).then((raw) => {
      if (raw) setSession(JSON.parse(raw));
      setIsLoading(false);
    });
  }, []);

  const login = async (sessionData) => {
    setSession(sessionData);
    await sessionSet(STORAGE_KEY, JSON.stringify(sessionData));
    // Same reasoning as logout()'s own removeItem below, but covering the gap
    // that fix didn't: a saved nav_state survives just fine if the *previous*
    // session ended via a clean logout, but nothing ends it if that previous
    // session instead ended by token expiry, a browser crash, or just closing
    // the tab - the RootNavigator.js restoration check only verifies "is this
    // a logged-in-shaped state," not "does this belong to the session that's
    // logging in right now," so a stale state passes that check and gets
    // restored regardless. Clearing it on every successful login (not just
    // logout) guarantees every login starts at Home, independent of how the
    // last session ended. Harmless no-op on native, which doesn't use this key.
    clearNavState();
  };

  const logout = async () => {
    setSession(null);
    await sessionRemove(STORAGE_KEY);
    // Web-only nav state persistence (RootNavigator.js's NAV_STATE_STORAGE_KEY)
    // is meant to survive a page RELOAD of the same live session, restoring
    // whatever screen was open - it was never meant to survive a logout. Left
    // uncleared, the next login (even a different person, on a shared device)
    // would land straight back on whatever deep screen (e.g. AI Chat) was
    // open when this session logged out, instead of defaulting to Home -
    // confirmed live. Harmless no-op on native, which doesn't use this key.
    clearNavState();
  };

  const updateSession = async (patch) => {
    const next = { ...session, ...patch };
    setSession(next);
    await sessionSet(STORAGE_KEY, JSON.stringify(next));
  };

  const value = useMemo(() => ({ session, isLoading, login, logout, updateSession }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
