import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// Protection Officer's own copy of the data-hooks pattern (per-role,
// no-shared-imports rule) - every /api/protectionofficer/* call hits this
// role's own mount (see backend/src/protection_officer/routes/protectionOfficer.routes.js).

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
    return apiClient.get(`/api/protectionofficer/referrals?${params.toString()}`, token);
  }, [token, status]);
}

export function useReferralDetail(referralId) {
  const token = getToken();
  return useQuery(
    () => (referralId ? apiClient.get(`/api/protectionofficer/referrals/${referralId}`, token) : Promise.resolve(null)),
    [token, referralId]
  );
}

export function useAddReferralNote() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId, noteText) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/protectionofficer/referrals/${referralId}/notes`, { noteText }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Requires a structured outcome - see ReferralDetail.jsx's ResolveDialog
// and the backend's own RESOLUTION_OUTCOME_CATEGORIES.
export function useResolveReferral() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId, outcomeCategory, outcomeDetail) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/protectionofficer/referrals/${referralId}/resolve`, { outcomeCategory, outcomeDetail }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Additive to (never replacing) the computed Threat Tier - pass null to
// clear the override. See ReferralDetail.jsx's ThreatAssessmentCard.
export function useSetManualThreatTier() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId, manualTier) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/protectionofficer/referrals/${referralId}/threat-tier`, { manualTier }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Completes an inbound directive (from District Collector, the only role
// with authority to direct Protection Officer) - surfaced inline on the
// relevant case's own Referral Detail (see pendingDirectives in
// useReferralDetail's response), not a standalone task list any more.
export function useCompleteDirective() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (taskId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/protectionofficer/tasks/${taskId}/complete`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Witness Protection and Relocation Request Assistance submissions - the
// Protection Officer's own proof-verified review queue (see
// interventionRequestReview.js). Jurisdiction-scoped server-side (same as
// this role's own referral queue) - no jurisdictionId param needed here.
export function useInterventionRequestsList(status) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return apiClient.get(`/api/protectionofficer/intervention-requests?${params.toString()}`, token);
  }, [token, status]);
}

export function useInterventionRequestDetail(requestId) {
  const token = getToken();
  return useQuery(
    () => (requestId ? apiClient.get(`/api/protectionofficer/intervention-requests/${requestId}`, token) : Promise.resolve(null)),
    [token, requestId]
  );
}

export function useReviewInterventionRequest() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (requestId, decision, reason) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/protectionofficer/intervention-requests/${requestId}/decision`, { decision, reason }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// The designation options this account may choose from (per role it holds)
// and the self-service update. Designation grants nothing - it's a
// descriptive record of the post held - which is why it is officer-editable,
// unlike station/district scoping, which stays Ministry-only because it
// decides which cases reach this queue.
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
