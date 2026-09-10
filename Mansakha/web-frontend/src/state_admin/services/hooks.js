import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// State Admin's own copy of the shared data-hooks file - trimmed to only the
// hooks State Admin's pages actually call. Every /api/admin/* call below
// hits the State tier's own mount (see backend/src/state_admin/routes/
// stateAdmin.routes.js) - this also serves the district-drill-down copy of
// AdminDashboard that lives in this same role folder.

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

export function useJurisdictionOptions(level, parentId) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams({ level });
    if (parentId) params.set('parentId', parentId);
    return apiClient.get(`/api/lookups/jurisdictions?${params.toString()}`, token);
  }, [token, level, parentId]);
}

export function useAdminDashboard(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/state/dashboard/${jurisdictionId}`, token) : Promise.resolve(null)),
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
    return apiClient.get(`/api/admin/state/reports-analytics/${jurisdictionId}?${q.toString()}`, token);
  }, [token, jurisdictionId, range, start, end]);
}

// Section B (workforce data) - which officials hold the 5 jurisdiction/
// station-scoped coordination roles in this admin's own subtree, and how
// their own queue is moving. See the backend route's own header comment for
// why Rehabilitation Officer is excluded here (Ministry's own copy covers it).
export function useCoordinationRolePerformance(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/state/coordination-roles/performance/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

export function useCoordinationStaffingGaps(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/state/coordination-roles/staffing-gaps/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

export function useExportReportCsv() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (jurisdictionId, name = 'report') => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/admin/state/dashboard/${jurisdictionId}/export`, {
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
    () => (jurisdictionId ? apiClient.get(`/api/admin/state/alerts/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// --- District-wise Reports workflow (State generates a district-wise
// report - each child district's rollup, side by side - and submits it to
// its own National, required, plus an optional direct cc to Ministry). ---

// Imperative - mutate(payload) posts { jurisdictionId, periodType, year,
// month|quarter|week, customStart, customEnd, commentary, asDraft,
// recipients } and resolves { reportId, generatedAt, status }. The required
// primary recipient (State's own National) is always added server-side -
// `recipients` here is ONLY the optional Ministry cc the checklist UI adds.
export function useGenerateReport() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/admin/state/reports/generate', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// `box` is 'inbox'|'outbox' - resolves to null/skips the call when
// jurisdictionId is falsy, matching useAdminDashboard's own guard pattern.
export function useReportsList(jurisdictionId, box) {
  const token = getToken();
  return useQuery(() => {
    if (!jurisdictionId) return Promise.resolve(null);
    const params = new URLSearchParams({ jurisdictionId, box });
    return apiClient.get(`/api/admin/state/reports?${params.toString()}`, token);
  }, [token, jurisdictionId, box]);
}

// Acts on the CALLER'S OWN recipient row only (a report cc'd to
// National+Ministry is reviewed independently by each) - this is State's
// own tier-scoped mount, unlike Ministry's copy of this same hook shape
// which is hardcoded to the national mount.
export function useUpdateReportStatus() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (reportId, status) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/admin/state/reports/${reportId}/status`, { status }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Forward an already-received report onward (e.g. to National and/or
// Ministry directly) without regenerating it - only a real RECIPIENT of a
// report can forward it (enforced server-side), so this only ever makes
// sense from the Inbox tab, never Outbox. `target` is {type:'jurisdiction',
// jurisdictionId} or {type:'ministry'}.
export function useForwardReport() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (reportId, target) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/admin/state/reports/${reportId}/forward`, target, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Mirrors useExportReportCsv's exact raw-fetch-to-blob-download pattern,
// just against the PDF route/content-type instead of the CSV export one.
export function useDownloadReportPdf() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (reportId, filename = 'report') => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/admin/state/reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to download PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
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
// "admin" even though this file is State Admin's own copy.

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
