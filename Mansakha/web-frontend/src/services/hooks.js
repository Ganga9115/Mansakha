import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// Plain useState/useEffect data hooks (this codebase has no query library
// yet) - one hook per backend endpoint, mirroring the pattern in
// frontend/src/services/hooks.js (the Expo app) but adapted to fetch/effect
// instead of react-query.

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

// --- Public lookups (used by Victim Registration forms) ---

export function useCaseTypeOptions() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/lookups/case-types', token), [token]);
}

// `level`: 'state' | 'district'. `parentId`: a state's jurisdictionId,
// required when level is 'district'.
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

// Real per-official notification feed (alert_notifications) - used by the
// shared NotificationBell in both StaffLayout and MinistryLayout, so every
// role's bell reflects actual data instead of being decorative.
export function useMyNotifications() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/me/notifications', token), [token]);
}

// Derives the logged-in Administration account's own jurisdiction from
// /api/me, so District/State/National dashboards don't each re-fetch and
// re-parse it - `jurisdictionId` is what every /api/admin/* route below is
// scoped to.
export function useMyJurisdiction() {
  const { data, loading, error } = useMe();
  const role = data?.roles?.[0];
  return { jurisdictionId: role?.jurisdictionId, jurisdictionLevel: role?.jurisdictionLevel, loading, error };
}

// --- District / State / National Administration ---

export function useAdminDashboard(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/dashboard/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// Backward-compatible: existing callers (AdminDashboard.jsx, StateDashboard.jsx)
// pass just a jurisdictionId string. Ministry Analytics & Workflow's Task 4E
// report submit/review UI needs the fuller periodStart/periodEnd/commentary/
// targetJurisdictionId/insightId fields from POST /api/admin/reports/generate
// too, so `mutate` also accepts one options object instead - whichever shape
// is passed, it's forwarded to the backend as-is (a string is wrapped into
// { jurisdictionId }).
export function useGenerateReport() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (jurisdictionIdOrPayload) => {
    const payload = typeof jurisdictionIdOrPayload === 'string' ? { jurisdictionId: jurisdictionIdOrPayload } : jurisdictionIdOrPayload;
    setLoading(true);
    try {
      return await apiClient.post('/api/admin/reports/generate', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useExportReportCsv() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (jurisdictionId, name = 'report') => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000'}/api/admin/dashboard/${jurisdictionId}/export`, {
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

// Ministry Analytics & Workflow Task 2E - PATCH /api/admin/reports/:reportId/status.
// Called by the RECIPIENT tier (the report's target_jurisdiction_id) to mark
// a received report 'Reviewed' (backend also allows 'Draft'/'Submitted' for
// robustness, though the spec's stated use case is 'Reviewed').
export function useUpdateReportStatus() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (reportId, status) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/admin/reports/${reportId}/status`, { status }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useCreateVictim() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/admin/victims', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Assumption (not yet in the backend prompt): a docket-number search so the
// Edit form can look a victim up without already knowing their internal id.
export function useSearchVictimByDocket() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (docketNumber) => {
    setLoading(true);
    try {
      return await apiClient.get(`/api/admin/victims?docketNumber=${encodeURIComponent(docketNumber)}`, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useUpdateVictim() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (victimId, payload) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/admin/victims/${victimId}`, payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// --- Advanced Ministry Analytics & Workflow ---

// Task 2A - POST /api/admin/analytics/generate. Admin-triggered only (never
// polled/auto-called - GEMINI_API_KEY is a small shared free-tier quota, see
// backend/src/services/gemini.js) - `mutate` takes { jurisdictionId,
// periodStart?, periodEnd? } and resolves to { insight } (insight is null
// when the backend found no interaction data for the period).
export function useGenerateAnalytics() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/admin/analytics/generate', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useAdminAlerts(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/alerts/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// Task 2B - GET /api/admin/policies/:jurisdictionId.
export function useFetchPolicies(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/policies/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// Task 2B - POST /api/admin/policies. `mutate` takes { title, description?,
// launchedAt, jurisdictionId }.
export function useCreatePolicy() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/admin/policies', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Task 2C - POST /api/admin/broadcast. `mutate` takes { jurisdictionId,
// message, priority? ('normal' | 'urgent') }, resolves to { queuedCount }
// (count of victims queued, not raw dispatch_queue rows).
export function useSendBroadcast() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/admin/broadcast', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Task 2D - GET /api/admin/counsellors/performance/:jurisdictionId. Resolves
// to { counsellors: [{ officialId, fullName, activeCaseCount,
// avgDistressPointDrop, victimsConsideredForEfficacy }] }.
export function useCounsellorPerformance(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/counsellors/performance/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

// --- Data Operator ---
// Not jurisdiction-locked like District Admin's /api/admin/victims - a
// separate route per the backend prompt's §7, sharing the same insert logic
// server-side.

export function useCreateVictimDataIntake() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (payload) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/data-intake/register-victim', payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useDataIntakeVictims() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/data-intake/victims', token), [token]);
}

export function useUpdateDataIntakeVictim() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (victimId, payload) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/data-intake/victims/${victimId}`, payload, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useDeleteDataIntakeVictim() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (victimId) => {
    setLoading(true);
    try {
      return await apiClient.delete(`/api/data-intake/victims/${victimId}`, token);
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
      return await apiClient.post('/api/data-intake/fetch-case', { docketNumber }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// --- Ministry: Staff/Account Management ---

// role/level select one Staff Management tab's category (level only applies
// to role='Administration' - National/State/District Admin are all that one
// role, split by jurisdiction level); page pages through it (some categories,
// like District Admin, run into the hundreds of rows).
export function useStaffList(role, level, page = 1) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (role) params.set('role', role);
    if (level) params.set('level', level);
    return apiClient.get(`/api/ministry/staff?${params.toString()}`, token);
  }, [token, role, level, page]);
}

export function useMinistryVictims(page = 1) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/ministry/victims?page=${page}`, token), [token, page]);
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

export function useRevokeStaff() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (officialId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/ministry/staff/${officialId}/revoke`, {}, token);
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
// Channels / Languages) - all four share one CRUD shape, so one factory
// generates the four hook sets instead of repeating them four times. ---

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
export const channelsResource = makeConfigResource('channels', 'channels');
export const languagesResource = makeConfigResource('languages', 'languages');

// --- Ministry: Oversight ---

export function useAuditLog(page) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/ministry/audit-log?page=${page || 1}`, token), [token, page]);
}

export function useHeatmap() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/ministry/heatmap', token), [token]);
}

export function useIvrsLog() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/ministry/ivrs-log', token), [token]);
}

export function useReportsInbox() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/ministry/reports', token), [token]);
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

export function useMyVictims(riskLevel, page = 1) {
  const token = getToken();
  return useQuery(
    () => {
      const q = new URLSearchParams({ page });
      if (riskLevel) q.set('risk', riskLevel);
      return apiClient.get(`/api/counsellor/my-victims?${q.toString()}`, token);
    },
    [token, riskLevel, page]
  );
}

export function useCaseDetail(victimId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${victimId}`, token), [token, victimId]);
}

export function useCaseNotes(victimId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${victimId}/notes`, token), [token, victimId]);
}

export function useInterventionTypes() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/counsellor/intervention-types', token), [token]);
}

const ALERTS_POLL_MS = 15000;

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

export function useScheduleSession(victimId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (scheduledAt) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/counsellor/cases/${victimId}/schedule`, { scheduledAt }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useCaseMessages(victimId) {
  const token = getToken();
  return useQuery(() => apiClient.get(`/api/counsellor/cases/${victimId}/messages`, token), [token, victimId]);
}

export function useSendCaseMessage(victimId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (message) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/counsellor/cases/${victimId}/messages`, { message }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// --- Mutations ---

export function useAddCaseNote(victimId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (noteText) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/counsellor/cases/${victimId}/notes`, { noteText }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useLogIntervention(victimId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async ({ interventionTypeId, notes }) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/counsellor/cases/${victimId}/intervention`, { interventionTypeId, notes }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useCompleteIntervention(victimId) {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (interventionId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/counsellor/cases/${victimId}/intervention/${interventionId}/complete`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}
