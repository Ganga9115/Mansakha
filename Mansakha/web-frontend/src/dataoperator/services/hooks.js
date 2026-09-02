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
