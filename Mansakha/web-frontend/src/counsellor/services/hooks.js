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

// Reports page's 3 charts (trend line, severity-distribution stacked bars,
// intervention-phase donut). `range` is one of '7d'|'30d'|'90d'|'custom';
// `start`/`end` (YYYY-MM-DD) are only used/required when range is 'custom' -
// until both are filled with a valid (end >= start) order, this resolves to
// null without hitting the network, so Reports.jsx can render a "pick a
// date range" prompt instead of firing a doomed/partial request.
export function useReportsAnalytics(range, start, end) {
  const token = getToken();
  return useQuery(() => {
    if (range === 'custom' && !(start && end && end >= start)) return Promise.resolve(null);
    const q = new URLSearchParams({ range });
    if (range === 'custom') {
      q.set('start', start);
      q.set('end', end);
    }
    return apiClient.get(`/api/counsellor/reports-analytics?${q.toString()}`, token);
  }, [token, range, start, end]);
}

export function useMyUsers(riskLevel, page = 1, search) {
  const token = getToken();
  return useQuery(
    () => {
      const q = new URLSearchParams({ page });
      // Backend reads req.query.riskLevel (counsellor.routes.js's /my-users) -
      // this was previously sent as `risk`, which that route never read, so
      // the Risk Level dropdown silently filtered nothing.
      if (riskLevel) q.set('riskLevel', riskLevel);
      if (search) q.set('q', search);
      return apiClient.get(`/api/counsellor/my-users?${q.toString()}`, token);
    },
    [token, riskLevel, page, search]
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

// Multi-Case-Per-Person Support - every other case belonging to the same
// person as this one (see backend counsellor.routes.js's comment on this
// route), so Case Detail can offer navigation to a person's other dockets.
export function useLinkedCases(userId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${userId}/linked-cases`, token), [token, userId]);
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

// Neither of these existed before - every alert (SOS or distress-score) had
// no way to ever leave "Open" except an SOS-adjacent intervention log
// incidentally moving it to "Acknowledged". `item.alertId` is actually a
// sos_event_id when item.source === 'sos', an alert_id otherwise (see the
// backend GET /alerts mapping) - route to the matching endpoint accordingly.
export function useResolveSosEvent() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (sosEventId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/counsellor/sos/${sosEventId}/resolve`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useResolveAlert() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (alertId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/counsellor/alerts/${alertId}/resolve`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// The "seen it, on it" middle state - same alertId-is-actually-a-sos_event_id
// caveat as useResolveSosEvent/useResolveAlert above.
export function useAcknowledgeSosEvent() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (sosEventId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/counsellor/sos/${sosEventId}/acknowledge`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useAcknowledgeAlert() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (alertId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/counsellor/alerts/${alertId}/acknowledge`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
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

// useLogIntervention/useCompleteIntervention removed - interventions are
// now victim-initiated (Request Assistance in the mobile app) and reviewed
// by District Admin, not created/completed by Counsellor. The read-only
// interventionStatus/suggestedInterventionType fields on useCaseDetail's own
// response still work unchanged - only the create/complete actions moved.

// ===== Mansakha Mail =====
// Internal staff mail (backend/src/mail/routes/mail.routes.js) - role-agnostic
// endpoints under /api/mail, so these hooks are plain, unprefixed by
// "counsellor" even though this file is Counsellor's own copy.

export function useMailDirectory(q) {
  const token = getToken();
  return useQuery(() => {
    const query = (q || '').trim();
    if (query.length < 2) return Promise.resolve({ officials: [] });
    return apiClient.get(`/api/mail/directory?q=${encodeURIComponent(query)}`, token);
  }, [token, q]);
}

export function useMailInbox(q, page = 1) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams({ page });
    if (q) params.set('q', q);
    return apiClient.get(`/api/mail/inbox?${params.toString()}`, token);
  }, [token, q, page]);
}

export function useMailSent(q, page = 1) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams({ page });
    if (q) params.set('q', q);
    return apiClient.get(`/api/mail/sent?${params.toString()}`, token);
  }, [token, q, page]);
}

export function useMailArchived(q, page = 1) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams({ page });
    if (q) params.set('q', q);
    return apiClient.get(`/api/mail/archived?${params.toString()}`, token);
  }, [token, q, page]);
}

export function useMailThread(threadId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/mail/threads/${threadId}`, token), [token, threadId]);
}

// Polled (mirrors useMyNotifications) so the sidebar badge updates without a
// manual refresh - powers StaffLayout's Mail nav badge.
export function useMailUnreadCount() {
  const token = getToken();
  const query = useQuery(() => apiClient.get('/api/mail/unread-count', token), [token]);
  useEffect(() => {
    const interval = setInterval(() => query.refetch(), 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.refetch]);
  return query;
}

// Imperative (non-hook-query) mail actions - compose/reply/send/attach/etc.
// all just need a one-shot call, not the loading/error/refetch shape above.
export function useMailActions() {
  const token = getToken();

  return {
    // { threadId?, subject?, body, recipientOfficialIds?, asDraft? } - no
    // threadId => new thread (subject + recipientOfficialIds required);
    // threadId => reply (subject/recipients inherited server-side).
    composeOrReply: (payload) => apiClient.post('/api/mail/messages', payload, token),
    updateDraft: (messageId, body) => apiClient.patch(`/api/mail/messages/${messageId}`, { body }, token),
    sendDraft: (messageId) => apiClient.post(`/api/mail/messages/${messageId}/send`, {}, token),
    deleteDraft: (messageId) => apiClient.delete(`/api/mail/messages/${messageId}`, token),
    uploadAttachment: (messageId, file) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.uploadFile(`/api/mail/messages/${messageId}/attachments`, formData, token);
    },
    removeAttachment: (messageId, attachmentId) => apiClient.delete(`/api/mail/messages/${messageId}/attachments/${attachmentId}`, token),
    getAttachmentUrl: (attachmentId) => apiClient.get(`/api/mail/attachments/${attachmentId}`, token),
    markThreadRead: (threadId) => apiClient.patch(`/api/mail/threads/${threadId}/read`, {}, token),
    markThreadUnread: (threadId) => apiClient.patch(`/api/mail/threads/${threadId}/unread`, {}, token),
    archiveThread: (threadId) => apiClient.patch(`/api/mail/threads/${threadId}/archive`, {}, token),
    unarchiveThread: (threadId) => apiClient.patch(`/api/mail/threads/${threadId}/unarchive`, {}, token),
    deleteThread: (threadId) => apiClient.delete(`/api/mail/threads/${threadId}`, token),
  };
}
