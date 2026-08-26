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

export function useAdminWorkload(jurisdictionId) {
  const token = getToken();
  return useQuery(
    () => (jurisdictionId ? apiClient.get(`/api/admin/workload/${jurisdictionId}`, token) : Promise.resolve(null)),
    [token, jurisdictionId]
  );
}

export function useGenerateReport() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (jurisdictionId) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/admin/reports/generate', { jurisdictionId }, token);
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

export function useStaffList() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/ministry/staff', token), [token]);
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

export function useCounsellorCases(riskLevel, page) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams();
    if (riskLevel) params.set('riskLevel', riskLevel);
    params.set('page', String(page || 1));
    return apiClient.get(`/api/counsellor/cases?${params.toString()}`, token);
  }, [token, riskLevel, page]);
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

  useEffect(() => {
    if (!enabled) return undefined;
    const interval = setInterval(query.refetch, ALERTS_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, query.refetch]);

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
