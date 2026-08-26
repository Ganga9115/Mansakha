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

export function useMe() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/me', token), [token]);
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

export function useCounsellorAlerts(enabled = true) {
  const token = getToken();
  return useQuery(() => (enabled ? apiClient.get('/api/counsellor/alerts', token) : Promise.resolve(null)), [token, enabled]);
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
