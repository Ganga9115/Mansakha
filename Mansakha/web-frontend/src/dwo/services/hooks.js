import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// District Welfare Officer's own copy of the data-hooks pattern (per-role,
// no-shared-imports rule) - every /api/dwo/* call hits this role's own
// mount (see backend/src/dwo/routes/dwo.routes.js).

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

export function useReferralsList(status) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return apiClient.get(`/api/dwo/referrals?${params.toString()}`, token);
  }, [token, status]);
}

export function useReferralDetail(referralId) {
  const token = getToken();
  return useQuery(
    () => (referralId ? apiClient.get(`/api/dwo/referrals/${referralId}`, token) : Promise.resolve(null)),
    [token, referralId]
  );
}

export function useAddReferralNote() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId, noteText) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/dwo/referrals/${referralId}/notes`, { noteText }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Sets relief type/amount and optionally marks it sanctioned - the real
// structured action behind DWO's Relief & Compliance card.
export function useSetRelief() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId, { reliefType, reliefAmount, sanctioned }) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/dwo/referrals/${referralId}/relief`, { reliefType, reliefAmount, sanctioned }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useResolveReferral() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/dwo/referrals/${referralId}/resolve`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useHandOffRehabilitation() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId, providerId) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/dwo/referrals/${referralId}/hand-off-rehabilitation`, { providerId }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Public reference data (no auth needed, but token is harmless to send) -
// populates the provider picker on the hand-off form.
export function useRehabilitationProviders() {
  const token = getToken();
  return useQuery(() => apiClient.get('/api/lookups/rehabilitation-providers', token), [token]);
}
