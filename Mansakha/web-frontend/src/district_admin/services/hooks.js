import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// District Admin's own copy of the shared data-hooks file - trimmed to only
// the hooks District Admin's pages actually call, per the no-shared-imports
// rule. Every /api/admin/* call below hits the District tier's own mount
// (see backend/src/district_admin/routes/districtAdmin.routes.js).

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

// --- District Administration ---

export function useAdminDashboard(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/district/dashboard/${jurisdictionId}`, token) : Promise.resolve(null)),
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
    return apiClient.get(`/api/admin/district/reports-analytics/${jurisdictionId}?${q.toString()}`, token);
  }, [token, jurisdictionId, range, start, end]);
}

export function useExportReportCsv() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (jurisdictionId, name = 'report') => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/api/admin/district/dashboard/${jurisdictionId}/export`, {
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

export function useCreateUser() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/admin/district/users', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useSearchUserByDocket() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (docketNumber) => {
    setLoading(true);
    try {
      return await apiClient.get(`/api/admin/district/users?docketNumber=${encodeURIComponent(docketNumber)}`, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useUpdateUser() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId, payload) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/admin/district/users/${userId}`, payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useAdminAlerts(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/district/alerts/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// --- Case Detail (read-only for Administration - the GET routes below allow
// both Counsellor and Administration; the write actions Counsellor's own
// copy has - notes/interventions/scheduling/chat - are intentionally not
// duplicated here since Administration never gets those per the PS's
// explicit Counsellor/Administration split). ---

export function useCaseDetail(userId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${userId}`, token), [token, userId]);
}

export function useCaseNotes(userId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${userId}/notes`, token), [token, userId]);
}
