import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// National Admin's own copy of the shared data-hooks file - trimmed to only
// the hooks National Admin's pages actually call. Every /api/admin/* call
// below hits the National tier's own mount (see backend/src/national_admin/
// routes/nationalAdmin.routes.js) - this single mount serves National's own
// dashboard AND its state-drill and district-drill copies, since all three
// views are reached under National Admin's own role/token.

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

export function useMyNotifications() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/me/notifications', token), [token]);
}

export function useMyJurisdiction() {
  const { data, loading, error } = useMe();
  const role = data?.roles?.[0];
  return { jurisdictionId: role?.jurisdictionId, jurisdictionLevel: role?.jurisdictionLevel, loading, error };
}

export function useAdminDashboard(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/national/dashboard/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// Reports page's 3 charts (trend line, severity-distribution stacked bars,
// intervention-phase donut), scoped to jurisdictionId's own subtree. `range`
// is one of '7d'|'30d'|'90d'|'custom'; `start`/`end` (YYYY-MM-DD) are only
// used/required when range is 'custom' - until both are filled with a valid
// (end >= start) order, this resolves to null without hitting the network,
// so Reports.jsx can render a "pick a date range" prompt instead of firing
// a doomed/partial request.
export function useReportsAnalytics(jurisdictionId, range, start, end) {
  const token = getToken();
  return useQuery(() => {
    if (!jurisdictionId) return Promise.resolve(null);
    if (range === 'custom' && !(start && end && end >= start)) return Promise.resolve(null);
    const q = new URLSearchParams({ range });
    if (range === 'custom') {
      q.set('start', start);
      q.set('end', end);
    }
    return apiClient.get(`/api/admin/national/reports-analytics/${jurisdictionId}?${q.toString()}`, token);
  }, [token, jurisdictionId, range, start, end]);
}

export function useExportReportCsv() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (jurisdictionId, name = 'report') => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/admin/national/dashboard/${jurisdictionId}/export`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to export report');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useAdminAlerts(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/national/alerts/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// --- Case Detail (read-only for Administration) ---

export function useCaseDetail(userId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${userId}`, token), [token, userId]);
}

export function useCaseNotes(userId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${userId}/notes`, token), [token, userId]);
}

// ===== Mansakha Mail =====
// Internal staff mail (backend/src/mail/routes/mail.routes.js) - role-agnostic
// endpoints under /api/mail, so these hooks are plain, unprefixed by
// "admin" even though this file is National Admin's own copy.

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
