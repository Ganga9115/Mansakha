import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// Data Operator's own copy of the shared data-hooks file - trimmed to only
// the hooks Data Operator's pages actually call. Not jurisdiction-locked
// like District Admin's own create/edit routes - a separate route per the
// backend prompt's §7, sharing the same insert logic server-side.

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

// --- Public lookups (used by User Registration form) ---

export function useCaseTypeOptions() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/lookups/case-types', token), [token]);
}

export function useJurisdictionOptions(level, parentId) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams({ level });
    if (parentId) params.set('parentId', parentId);
    return apiClient.get(`/api/lookups/jurisdictions?${params.toString()}`, token);
  }, [token, level, parentId]);
}

// migration_033 - which police station registered the FIR, narrowed to the
// district already selected in the form (a station belongs to exactly one
// district). Returns an empty list until a district is chosen.
export function usePoliceStationOptions(jurisdictionId) {
  const token = getToken();
  return useQuery(() => {
    if (!jurisdictionId) return Promise.resolve({ stations: [] });
    return apiClient.get(`/api/lookups/police-stations?jurisdictionId=${jurisdictionId}`, token);
  }, [token, jurisdictionId]);
}

export function useMe() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/me', token), [token]);
}

export function useMyNotifications() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/me/notifications', token), [token]);
}

// --- Data Operator ---

export function useCreateUserDataOperator() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/dataoperator/register-user', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useDataOperatorUsers() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/dataoperator/users', token), [token]);
}

export function useUpdateDataOperatorUser() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId, payload) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/dataoperator/users/${userId}`, payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useDeleteDataOperatorUser() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId) => {
    setLoading(true);
    try {
      return await apiClient.delete(`/api/dataoperator/users/${userId}`, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useFetchCaseDetails() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (docketNumber) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/dataoperator/fetch-case', { docketNumber }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// --- Multi-Case-Per-Person Support ---

// Not a useQuery-on-mount hook (like the others above) - search only fires
// when the operator actually types something, not on every render, so this
// is a plain mutate-style function the caller invokes explicitly.
export function useSearchPerson() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (q) => {
    setLoading(true);
    try {
      return await apiClient.get(`/api/dataoperator/search-person?q=${encodeURIComponent(q)}`, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useRegisterLinkedCase() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/dataoperator/register-linked-case', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useLinkExistingCase() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId, linkToUserId) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/dataoperator/users/${userId}/link`, { linkToUserId }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// ===== Mansakha Mail =====
// Internal staff mail (backend/src/mail/routes/mail.routes.js) - role-agnostic
// endpoints under /api/mail, so these hooks are plain, unprefixed by
// "dataoperator" even though this file is Data Operator's own copy.

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
