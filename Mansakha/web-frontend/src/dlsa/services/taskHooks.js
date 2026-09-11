import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// Structured task hooks - DLSA Coordinator's copy (mirrors
// dwo/services/taskHooks.js, the template). Kept separate from
// services/hooks.js only for readability; same no-shared-imports rule as
// every other file in this folder.

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

export function useTasksList(status) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return apiClient.get(`/api/dlsa/tasks?${params.toString()}`, token);
  }, [token, status]);
}

// useCreateTask removed - this role cannot raise directives for other
// offices (see its own routes.js for why). Only District Collector can.
export function useCompleteTask() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (taskId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/dlsa/tasks/${taskId}/complete`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}
