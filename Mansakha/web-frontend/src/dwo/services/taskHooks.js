import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// Structured task hooks - District Welfare Officer's copy (THE TEMPLATE for
// the other 6 role folders' identical file). Kept separate from
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

// useTasksList removed along with the "My Tasks" page it backed - a
// directive is listed and completed on the case it concerns instead
// (useReferralTasks + useCompleteTask below).
export function useCreateTask() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId, assignedToRole, action, dueAt, sourceReferralId) => {
    setLoading(true);
    try {
      return await apiClient.post('/api/dwo/tasks', { userId, assignedToRole, action, dueAt, sourceReferralId }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Every task raised against one specific case (across any role), for that
// case's own Tasks page - not this role's global My Tasks queue.
export function useReferralTasks(referralId) {
  const token = getToken();
  return useQuery(
    () => (referralId ? apiClient.get(`/api/dwo/referrals/${referralId}/tasks`, token) : Promise.resolve(null)),
    [token, referralId]
  );
}

export function useCompleteTask() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (taskId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/dwo/tasks/${taskId}/complete`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}
