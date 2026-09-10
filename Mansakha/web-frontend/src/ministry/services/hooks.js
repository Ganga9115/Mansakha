import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// Ministry's own copy of the shared data-hooks file - trimmed to only the
// hooks Ministry's pages actually call. Ministry is a jurisdiction-
// unrestricted superset of Administration (Section 3), so its dashboard/
// analytics calls reuse the National tier's own mount
// (backend/src/national_admin/routes/nationalAdmin.routes.js allows
// Ministry through requireRole(['Administration','Ministry'])), scoped to
// the root national jurisdiction id. Emergency Broadcast and Deploy Policy
// were retired as not appropriate for this system's real scope.

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

export function useJurisdictionOptions(level, parentId) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams({ level });
    if (parentId) params.set('parentId', parentId);
    return apiClient.get(`/api/lookups/jurisdictions?${params.toString()}`, token);
  }, [token, level, parentId]);
}

// migration_031/033 - which centre a Rehabilitation Officer works for /
// which station an Investigating Officer works at, needed when Staff
// Management creates one of those accounts (mirrors jurisdictionId's own
// picker above).
export function useRehabilitationProviderOptions() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/lookups/rehabilitation-providers', token), [token]);
}

export function usePoliceStationOptions(jurisdictionId) {
  const token = getToken();
  return useQuery(() => {
    if (!jurisdictionId) return Promise.resolve({ stations: [] });
    return apiClient.get(`/api/lookups/police-stations?jurisdictionId=${jurisdictionId}`, token);
  }, [token, jurisdictionId]);
}

// --- National-tier dashboard/broadcast/policy/analytics (Ministry's own
// "home" view reuses these, scoped to the root national jurisdiction). ---

export function useAdminDashboard(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/national/dashboard/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// Task 2A - admin-triggered only (never polled/auto-called - GEMINI_API_KEY
// is a small shared free-tier quota, see backend/src/ai/gemini.js).
export function useGenerateAnalytics() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/admin/national/analytics/generate', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// --- Ministry: Staff/Account Management ---

export function useStaffList(role, level, page = 1) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (role) params.set('role', role);
    if (level) params.set('level', level);
    return apiClient.get(`/api/ministry/staff?${params.toString()}`, token);
  }, [token, role, level, page]);
}

export function useMinistryUsers(page = 1) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/ministry/users?page=${page}`, token), [token, page]);
}

export function useCreateStaff() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/ministry/staff', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useUpdateStaff() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (officialId, payload) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/ministry/staff/${officialId}`, payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Updates the scope (jurisdiction/provider/station) on an official's
// EXISTING active grant of one role, in place - distinct from
// useCreateStaff/POST staff/:id/roles, which always inserts a fresh grant.
// See ministry.routes.js's own comment on why this had to be a separate
// route rather than reusing that one.
export function useUpdateStaffScope() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (officialId, roleName, payload) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/ministry/staff/${officialId}/roles/${encodeURIComponent(roleName)}/scope`, payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useDeleteStaff() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (officialId) => {
    setLoading(true);
    try {
      return await apiClient.delete(`/api/ministry/staff/${officialId}`, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// --- Ministry: System Configuration (Case Types / Intervention Types /
// Languages) - all three share one CRUD shape, so one factory generates the
// three hook sets instead of repeating them three times. ---

function makeConfigResource(resourcePath, listKey) {
  return {
    useList: () => {
      const token = getToken();
      return useQuery(() => apiClient.get(`/api/ministry/${resourcePath}`, token), [token]);
    },
    useCreate: () => {
      const token = getToken();
      const [loading, setLoading] = useState(false);
      const mutate = async (payload) => {
        setLoading(true);
        try {
          return await apiClient.post(`/api/ministry/${resourcePath}`, payload, token);
        } finally {
          setLoading(false);
        }
      };
      return { mutate, loading };
    },
    useUpdate: () => {
      const token = getToken();
      const [loading, setLoading] = useState(false);
      const mutate = async (id, payload) => {
        setLoading(true);
        try {
          return await apiClient.patch(`/api/ministry/${resourcePath}/${id}`, payload, token);
        } finally {
          setLoading(false);
        }
      };
      return { mutate, loading };
    },
    useDelete: () => {
      const token = getToken();
      const [loading, setLoading] = useState(false);
      const mutate = async (id) => {
        setLoading(true);
        try {
          return await apiClient.delete(`/api/ministry/${resourcePath}/${id}`, token);
        } finally {
          setLoading(false);
        }
      };
      return { mutate, loading };
    },
    listKey,
  };
}

export const caseTypesResource = makeConfigResource('case-types', 'caseTypes');
export const interventionTypesResource = makeConfigResource('intervention-types', 'interventionTypes');
export const languagesResource = makeConfigResource('languages', 'languages');
// Backend has a complete GET/POST/PATCH/DELETE /api/ministry/channels
// (ministry.routes.js), soft-deleted and audit-logged exactly like the three
// above - it just had no frontend resource/tab to reach it at all, despite
// Ministry's own Login page copy explicitly advertising "interaction
// channels" configuration.
export const channelsResource = makeConfigResource('channels', 'channels');

// --- Ministry: Police Stations (migration_033) - not a drop-in fit for
// makeConfigResource above (a station also needs a district), so its own
// small hook set instead. ---

export function usePoliceStationsForDistrict(jurisdictionId) {
  const token = getToken();
  return useQuery(() => {
    if (!jurisdictionId) return Promise.resolve({ stations: [] });
    return apiClient.get(`/api/ministry/police-stations?jurisdictionId=${jurisdictionId}`, token);
  }, [token, jurisdictionId]);
}

// Simulated lookup by station code - same honesty discipline as
// courtCaseSimulation.js/Fetch Case: review the suggested name before
// actually saving it with useCreatePoliceStation below.
export function useFetchPoliceStation() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/ministry/police-stations/fetch', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useCreatePoliceStation() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/ministry/police-stations', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useUpdatePoliceStation() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (stationId, payload) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/ministry/police-stations/${stationId}`, payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useDeletePoliceStation() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (stationId) => {
    setLoading(true);
    try {
      return await apiClient.delete(`/api/ministry/police-stations/${stationId}`, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// --- Ministry: Oversight ---

export function useAuditLog(page) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/ministry/audit-log?page=${page || 1}`, token), [token, page]);
}

export function useHeatmap() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/ministry/heatmap', token), [token]);
}

export function useReportsInbox() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/ministry/reports', token), [token]);
}

export function useUpdateReportStatus() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (reportId, status) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/admin/national/reports/${reportId}/status`, { status }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Mirrors useExportReportCsv-style raw-fetch-to-blob-download pattern (see
// e.g. district_admin/services/hooks.js), against Ministry's own PDF route.
export function useDownloadReportPdf() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (reportId, filename = 'report') => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/ministry/reports/${reportId}/pdf`, {
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

export function useCounsellorPerformance(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/national/counsellors/performance/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// ===== Mansakha Mail =====
// Internal staff mail (backend/src/mail/routes/mail.routes.js) - role-agnostic
// endpoints under /api/mail, so these hooks are plain, unprefixed by
// "ministry" even though this file is Ministry's own copy.

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
// manual refresh - powers MinistryLayout's Mail nav badge.
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

// Designation lists come from the server (core/services/officialDesignations.js)
// - deliberately NOT a second hardcoded copy here, which had already drifted
// out of sync with the real list once.
export function useDesignationOptions() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/ministry/designation-options', token), [token]);
}
