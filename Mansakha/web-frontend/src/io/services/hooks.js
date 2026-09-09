import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// Investigating Officer's own copy of the data-hooks pattern (per-role,
// no-shared-imports rule) - every /api/io/* call hits this role's own mount
// (see backend/src/io/routes/io.routes.js). Station-scoped case queue, NOT
// referral-based like every other new-role portal - "every registered case
// gets investigated" (assigned via users.station_id), not a District-Admin-
// created escalation.

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

export function useCasesList(status) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return apiClient.get(`/api/io/cases?${params.toString()}`, token);
  }, [token, status]);
}

export function useCaseDetail(userId) {
  const token = getToken();
  return useQuery(
    () => (userId ? apiClient.get(`/api/io/cases/${userId}`, token) : Promise.resolve(null)),
    [token, userId]
  );
}

export function useCaseTasks(userId) {
  const token = getToken();
  return useQuery(
    () => (userId ? apiClient.get(`/api/io/cases/${userId}/tasks`, token) : Promise.resolve(null)),
    [token, userId]
  );
}

export function useAddCaseNote() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId, noteText) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/io/cases/${userId}/notes`, { noteText }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Sets Accused Status - the real, structured signal Threat Tier is computed
// from server-side (see backend/src/core/services/threatAssessment.js).
export function useSetAccusedStatus() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId, accusedStatus) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/io/cases/${userId}/accused-status`, { accusedStatus }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Victim-safe progress summary shown on the victim's own Case Details.
export function useSetInvestigationProgress() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId, investigationProgress) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/io/cases/${userId}/investigation-progress`, { investigationProgress }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// migration_034: this no longer touches the shared case_stage at all - it
// only records chargesheetStatus/chargesheetFiledAt on this case's own
// investigation record. case_stage is set exclusively by the (simulated)
// eCourt sync worker.
export function useFileChargesheet() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/io/cases/${userId}/chargesheet`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useMarkInvestigationComplete() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/io/cases/${userId}/investigation-complete`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// "Threat detected -> Protection Officer alerted" - creates a real referral
// for the jurisdiction's Protection Officer, not just a notification.
export function useAlertProtectionOfficer() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (userId, reason) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/io/cases/${userId}/alert-protection-officer`, { reason }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}
