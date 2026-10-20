import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

// Same reasoning as AuthContext.js's own sessionGet/Set/Remove: AsyncStorage
// is localStorage on web, shared across every tab of the same origin - so
// with two victims signed in in two tabs (now possible since AuthContext's
// own fix), whichever docket one tab picked could bleed into the other tab
// via this shared key, defeating the "never leaks to the next person" intent
// right below. sessionStorage keeps it isolated per tab, matching the
// session token it's scoped to. Native is untouched - one victim per device.
const isWeb = Platform.OS === 'web';
async function storageGet(key) {
  return isWeb ? window.sessionStorage.getItem(key) : AsyncStorage.getItem(key);
}
async function storageSet(key, value) {
  if (isWeb) { window.sessionStorage.setItem(key, value); return; }
  return AsyncStorage.setItem(key, value);
}
async function storageRemove(key) {
  if (isWeb) { window.sessionStorage.removeItem(key); return; }
  return AsyncStorage.removeItem(key);
}

// Single source of truth for "which docket, out of the caller's own linked
// case family, is currently being browsed" - previously each screen that
// needed this (Home, Case Details, Request Assistance, Compensation,
// Rehabilitation Progress) tracked it independently (some via local
// component state, Case Details via its own switcher, Settings via its own
// separate AsyncStorage key), so picking a docket in one place never
// affected any other screen. This is the one place that selection now
// lives - Settings/Profile's own docket switcher (the only one left in the
// app) writes here, and every case-scoped screen reads from here by default.
//
// null means "no explicit selection - use the anchor", matching every
// existing hook's own caseUserId-omitted behaviour (useUserDashboard,
// useCourtCaseDetails, etc. already default to the anchor server-side).

const ActiveCaseContext = createContext(null);
const STORAGE_KEY = 'mansakha_active_case_user_id';

export function ActiveCaseProvider({ children }) {
  const { session } = useAuth();
  const [activeCaseUserId, setActiveCaseUserIdState] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    storageGet(STORAGE_KEY)
      .then((v) => setActiveCaseUserIdState(v || null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Logout clears the selection - a docket picked by whoever was using this
  // device before must never silently apply to the next person who logs in
  // on it, same reasoning AuthContext's own logout() clearing already follows.
  useEffect(() => {
    if (!session) {
      setActiveCaseUserIdState(null);
      storageRemove(STORAGE_KEY).catch(() => {});
    }
  }, [session]);

  const setActiveCaseUserId = async (userId) => {
    setActiveCaseUserIdState(userId || null);
    try {
      if (userId) await storageSet(STORAGE_KEY, userId);
      else await storageRemove(STORAGE_KEY);
    } catch {
      // Best-effort persistence - the in-memory state above already applied,
      // so a storage failure just means the choice won't survive a restart.
    }
  };

  const value = useMemo(() => ({ activeCaseUserId, setActiveCaseUserId, loaded }), [activeCaseUserId, loaded]);

  return <ActiveCaseContext.Provider value={value}>{children}</ActiveCaseContext.Provider>;
}

export function useActiveCase() {
  const ctx = useContext(ActiveCaseContext);
  if (!ctx) throw new Error('useActiveCase must be used within ActiveCaseProvider');
  return ctx;
}
