import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// Legal Representative's own copy of the data-hooks pattern (per-role,
// no-shared-imports rule) - every /api/legalrepresentative/* call hits this
// role's own mount (see backend/src/legal_representative/routes/legalRepresentative.routes.js).

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

export function useDesignationOptions() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/me/designation-options', token), [token]);
}

export function useUpdateDesignation() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (roleName, designation) => {
    setLoading(true);
    try {
      return await apiClient.patch('/api/me/designation', { roleName, designation }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useMyCases(status) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return apiClient.get(`/api/legalrepresentative/my-cases?${params.toString()}`, token);
  }, [token, status]);
}

export function useMyCaseDetail(requestId) {
  const token = getToken();
  return useQuery(
    () => (requestId ? apiClient.get(`/api/legalrepresentative/my-cases/${requestId}`, token) : Promise.resolve(null)),
    [token, requestId]
  );
}

export function useRecordHearing() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (requestId, hearing) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/legalrepresentative/my-cases/${requestId}/hearings`, hearing, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function usePrivateNotes(requestId) {
  const token = getToken();
  return useQuery(
    () => (requestId ? apiClient.get(`/api/legalrepresentative/my-cases/${requestId}/private-notes`, token) : Promise.resolve(null)),
    [token, requestId]
  );
}

export function useAddPrivateNote() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (requestId, noteText) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/legalrepresentative/my-cases/${requestId}/private-notes`, { noteText }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useUpcomingHearings() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/legalrepresentative/hearings-upcoming', token), [token]);
}
