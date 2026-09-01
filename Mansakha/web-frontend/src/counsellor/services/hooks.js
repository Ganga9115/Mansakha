import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// Plain useState/useEffect data hooks (this codebase has no query library
// yet) - one hook per backend endpoint, mirroring the pattern in
// frontend/src/services/hooks.js (the Expo app) but adapted to fetch/effect
// instead of react-query. Counsellor's own copy - trimmed to only the hooks
// Counsellor's pages actually call, per the no-shared-imports rule.

function useQuery(queryFn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const refetch = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    queryFn()
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err) => { if (!cancelled) setState({ data: null, loading: false, error: err.message }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => refetch(), [refetch]);

  return { ...state, refetch };
}

export function useMe() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/me', token), [token]);
}

// Real per-official notification feed (alert_notifications) - backs the
// NotificationBell in StaffLayout.
export function useMyNotifications() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/me/notifications', token), [token]);
}

export function useCounsellorDashboard() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/counsellor/dashboard', token), [token]);
}

export function useCounsellorCases(riskLevel, page = 1) {
  const token = getToken();
  return useQuery(
    () => {
      const q = new URLSearchParams({ page });
      if (riskLevel) q.set('risk', riskLevel);
      return apiClient.get(`/api/counsellor/cases?${q.toString()}`, token);
    },
    [token, riskLevel, page]
  );
}

export function useMyUsers(riskLevel, page = 1) {
  const token = getToken();
  return useQuery(
    () => {
      const q = new URLSearchParams({ page });
      if (riskLevel) q.set('risk', riskLevel);
      return apiClient.get(`/api/counsellor/my-users?${q.toString()}`, token);
    },
    [token, riskLevel, page]
  );
}

export function useCaseDetail(userId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${userId}`, token), [token, userId]);
}

export function useCaseNotes(userId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${userId}/notes`, token), [token, userId]);
}

export function useInterventionTypes() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/counsellor/intervention-types', token), [token]);
}

// True push (a Supabase Realtime subscription) needs an anon-key channel
// scoped by RLS to just this counsellor's own alerts - that's a backend/RLS
// change this pass can't safely make blind (a naive subscription risks
// leaking every counsellor's alerts to every browser tab). Polling gets the
// user-facing result - the feed updates without a manual refresh - without
// guessing at infra that isn't confirmed to exist yet.
export function useCounsellorAlerts(enabled = true) {
  const token = getToken();
  const query = useQuery(() => (enabled ? apiClient.get('/api/counsellor/alerts', token) : Promise.resolve(null)), [token, enabled]);
  return query;
}

export function useScheduledSessions() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/counsellor/scheduled', token), [token]);
}

export function useScheduleSession(userId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (scheduledAt) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/counsellor/cases/${userId}/schedule`, { scheduledAt }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useCaseMessages(userId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${userId}/messages`, token), [token, userId]);
}

export function useSendCaseMessage(userId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (message) => {
    setLoading(true);
    try {
      // The backend route reads req.body.body (matching the user-side POST
      // /api/user/messages contract) - this was previously sending
      // { message }, which the server always rejected with "body is
      // required" (confirmed live).
      return await apiClient.post(`/api/counsellor/cases/${userId}/messages`, { body: message }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useSendCaseVoiceMessage(userId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (blob, durationSeconds) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', blob);
      formData.append('duration', String(Math.round(durationSeconds)));
      return await apiClient.uploadFile(`/api/counsellor/cases/${userId}/messages/voice`, formData, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Fire-and-forget typing ping - throttled by the caller (CaseChat.jsx), not
// here, since the throttle needs to compare against the composer's own
// keystroke timing, not this hook's lifecycle.
export function useSendTypingPing(userId) {
  const token = getToken();
  return async () => {
    await apiClient.post(`/api/counsellor/cases/${userId}/messages/typing`, {}, token);
  };
}

export function useAddCaseNote(userId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (noteText) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/counsellor/cases/${userId}/notes`, { noteText }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useCompleteIntervention(userId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (interventionId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/counsellor/cases/${userId}/intervention/${interventionId}/complete`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}
