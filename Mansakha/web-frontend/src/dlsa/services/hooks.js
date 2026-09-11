import { useCallback, useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import { getToken } from './auth';

// DLSA Coordinator's own copy of the data-hooks pattern (per-role,
// no-shared-imports rule) - every /api/dlsa/* call hits this role's own
// mount (see backend/src/dlsa/routes/dlsa.routes.js).

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
    return apiClient.get(`/api/dlsa/referrals?${params.toString()}`, token);
  }, [token, status]);
}

export function useReferralDetail(referralId) {
  const token = getToken();
  return useQuery(
    () => (referralId ? apiClient.get(`/api/dlsa/referrals/${referralId}`, token) : Promise.resolve(null)),
    [token, referralId]
  );
}

export function useAddReferralNote() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId, noteText) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/dlsa/referrals/${referralId}/notes`, { noteText }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useAssignLawyer() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId, lawyerName) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/dlsa/referrals/${referralId}/assign-lawyer`, { lawyerName }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useMarkTrialReady() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (referralId) => {
    setLoading(true);
    try {
      return await apiClient.post(`/api/dlsa/referrals/${referralId}/mark-trial-ready`, {}, token);
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
      return await apiClient.patch(`/api/dlsa/referrals/${referralId}/resolve`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// Legal Aid Request Assistance submissions - DLSA's own proof-verified
// review queue (see interventionRequestReview.js). Not jurisdiction-scoped,
// same as this role's own referral queue.
export function useInterventionRequestsList(status) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return apiClient.get(`/api/dlsa/intervention-requests?${params.toString()}`, token);
  }, [token, status]);
}

export function useInterventionRequestDetail(requestId) {
  const token = getToken();
  return useQuery(
    () => (requestId ? apiClient.get(`/api/dlsa/intervention-requests/${requestId}`, token) : Promise.resolve(null)),
    [token, requestId]
  );
}

export function useReviewInterventionRequest() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (requestId, decision, reason) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/dlsa/intervention-requests/${requestId}/decision`, { decision, reason }, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

// ===== Legal Aid Requests (migration_040, dedicated pipeline) =====
// The real DLSA workflow - jurisdiction-scoped, 7-stage lifecycle. Separate
// from useReferralsList/useInterventionRequestsList above, which stay
// pointed at the old, now-unlinked-from-nav legacy pages.

export function useLegalAidRequestsList(status) {
  const token = getToken();
  return useQuery(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return apiClient.get(`/api/dlsa/legal-aid-requests?${params.toString()}`, token);
  }, [token, status]);
}

export function useLegalAidRequestDetail(requestId) {
  const token = getToken();
  return useQuery(
    () => (requestId ? apiClient.get(`/api/dlsa/legal-aid-requests/${requestId}`, token) : Promise.resolve(null)),
    [token, requestId]
  );
}

export function useEligibleRepresentatives(requestId) {
  const token = getToken();
  return useQuery(
    () => (requestId ? apiClient.get(`/api/dlsa/legal-aid-requests/${requestId}/eligible-representatives`, token) : Promise.resolve(null)),
    [token, requestId]
  );
}

function useLegalAidAction(buildPath, method = 'PATCH') {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (requestId, body = {}) => {
    setLoading(true);
    try {
      return await apiClient[method === 'PATCH' ? 'patch' : 'post'](buildPath(requestId), body, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}

export function useStartLegalAidReview() {
  return useLegalAidAction((id) => `/api/dlsa/legal-aid-requests/${id}/start-review`);
}
export function useRejectLegalAidRequest() {
  return useLegalAidAction((id) => `/api/dlsa/legal-aid-requests/${id}/reject`);
}
// migration_043: assign-representative is reachable directly from 'Under
// Review' now - the 'Verify'/'Approve' steps that used to sit in between are
// retired, so there's no hook for them any more.
export function useAssignRepresentative() {
  return useLegalAidAction((id) => `/api/dlsa/legal-aid-requests/${id}/assign-representative`, 'POST');
}
export function useReassignRepresentative() {
  return useLegalAidAction((id) => `/api/dlsa/legal-aid-requests/${id}/reassign`, 'POST');
}
export function useContinueLegalAidFeedback() {
  const token = getToken();
  const [loading, setLoading] = useState(false);
  const mutate = async (requestId, feedbackId) => {
    setLoading(true);
    try {
      return await apiClient.patch(`/api/dlsa/legal-aid-requests/${requestId}/feedback/${feedbackId}/continue`, {}, token);
    } finally {
      setLoading(false);
    }
  };
  return { mutate, loading };
}
