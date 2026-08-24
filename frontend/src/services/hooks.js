import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import { useAuth } from '../context/AuthContext';

// One hook per backend endpoint - centralizes loading/error state instead of
// repeating useState/useEffect fetch boilerplate in every screen.

function useToken() {
  const { session } = useAuth();
  return session?.token;
}

// --- Public lookups (no auth - needed before a session exists, e.g. the
// Victim registration form) ---

export function useCaseTypeOptions() {
  return useQuery({ queryKey: ['lookups', 'case-types'], queryFn: () => apiClient.get('/api/lookups/case-types') });
}

export function useDistrictOptions() {
  return useQuery({ queryKey: ['lookups', 'jurisdictions'], queryFn: () => apiClient.get('/api/lookups/jurisdictions') });
}

export function useLanguageOptions() {
  return useQuery({ queryKey: ['lookups', 'languages'], queryFn: () => apiClient.get('/api/lookups/languages') });
}

// --- Victim ---

export function useVictimRegister() {
  return useMutation({ mutationFn: (payload) => apiClient.post('/api/auth/victim/register', payload) });
}

export function useVictimPasswordLogin() {
  return useMutation({ mutationFn: ({ identifier, password }) => apiClient.post('/api/auth/victim/login', { identifier, password }) });
}

export function useVictimDashboard() {
  const token = useToken();
  return useQuery({ queryKey: ['victim', 'dashboard'], queryFn: () => apiClient.get('/api/victim/dashboard', token), enabled: !!token });
}

export function useConsentStatus() {
  const token = useToken();
  return useQuery({ queryKey: ['victim', 'consent-status'], queryFn: () => apiClient.get('/api/victim/consent-status', token), enabled: !!token });
}

export function useSubmitConsent() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channel) => apiClient.post('/api/victim/consent', { channel }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['victim', 'consent-status'] }),
  });
}

export function useCheckin() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channel, responses }) => apiClient.post('/api/victim/checkin', { channel, responses }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['victim', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['victim', 'distress-history'] });
    },
  });
}

export function useUpdateVictimLanguage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (languageId) => apiClient.patch('/api/victim/language', { languageId }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['victim', 'dashboard'] }),
  });
}

export function useDistressHistory() {
  const token = useToken();
  return useQuery({ queryKey: ['victim', 'distress-history'], queryFn: () => apiClient.get('/api/victim/distress-history', token), enabled: !!token });
}

// --- Counsellor ---

export function useInterventionTypes() {
  const token = useToken();
  return useQuery({ queryKey: ['counsellor', 'intervention-types'], queryFn: () => apiClient.get('/api/counsellor/intervention-types', token), enabled: !!token });
}

export function useCounsellorDashboard() {
  const token = useToken();
  return useQuery({ queryKey: ['counsellor', 'dashboard'], queryFn: () => apiClient.get('/api/counsellor/dashboard', token), enabled: !!token });
}

export function useCounsellorCases(riskLevel, page) {
  const token = useToken();
  const params = new URLSearchParams();
  if (riskLevel) params.set('riskLevel', riskLevel);
  params.set('page', String(page || 1));
  return useQuery({
    queryKey: ['counsellor', 'cases', riskLevel, page],
    queryFn: () => apiClient.get(`/api/counsellor/cases?${params.toString()}`, token),
    enabled: !!token,
  });
}

// Shared by Counsellor (full access) and Administration (read-only) - same backend
// route, per the broadened role check in routes/counsellor.js.
export function useCaseDetail(victimId) {
  const token = useToken();
  return useQuery({
    queryKey: ['case', victimId],
    queryFn: () => apiClient.get(`/api/counsellor/cases/${victimId}`, token),
    enabled: !!token && !!victimId,
  });
}

export function useCompleteIntervention(victimId) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (interventionId) => apiClient.patch(`/api/counsellor/cases/${victimId}/intervention/${interventionId}/complete`, {}, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case', victimId] }),
  });
}

export function useCaseNotes(victimId) {
  const token = useToken();
  return useQuery({
    queryKey: ['case', victimId, 'notes'],
    queryFn: () => apiClient.get(`/api/counsellor/cases/${victimId}/notes`, token),
    enabled: !!token && !!victimId,
  });
}

export function useAddCaseNote(victimId) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteText) => apiClient.post(`/api/counsellor/cases/${victimId}/notes`, { noteText }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case', victimId, 'notes'] }),
  });
}

export function useLogIntervention(victimId) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interventionTypeId, notes }) => apiClient.post(`/api/counsellor/cases/${victimId}/intervention`, { interventionTypeId, notes }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['case', victimId] }),
  });
}

const ALERT_POLL_INTERVAL_MS = 15000; // poll, not raw Realtime - see security_and_realtime.sql

export function useCounsellorAlerts() {
  const token = useToken();
  return useQuery({
    queryKey: ['counsellor', 'alerts'],
    queryFn: () => apiClient.get('/api/counsellor/alerts', token),
    enabled: !!token,
    refetchInterval: ALERT_POLL_INTERVAL_MS,
  });
}

// --- Administration ---

export function useRootJurisdiction(enabled) {
  const token = useToken();
  return useQuery({ queryKey: ['admin', 'root-jurisdiction'], queryFn: () => apiClient.get('/api/admin/root-jurisdiction', token), enabled: !!token && enabled });
}

export function useAdminDashboard(jurisdictionId) {
  const token = useToken();
  return useQuery({
    queryKey: ['admin', 'dashboard', jurisdictionId],
    queryFn: () => apiClient.get(`/api/admin/dashboard/${jurisdictionId}`, token),
    enabled: !!token && !!jurisdictionId,
  });
}

export function useAdminAlerts(jurisdictionId) {
  const token = useToken();
  return useQuery({
    queryKey: ['admin', 'alerts', jurisdictionId],
    queryFn: () => apiClient.get(`/api/admin/alerts/${jurisdictionId}`, token),
    enabled: !!token && !!jurisdictionId,
    refetchInterval: ALERT_POLL_INTERVAL_MS,
  });
}

export function useWorkload(jurisdictionId) {
  const token = useToken();
  return useQuery({
    queryKey: ['admin', 'workload', jurisdictionId],
    queryFn: () => apiClient.get(`/api/admin/workload/${jurisdictionId}`, token),
    enabled: !!token && !!jurisdictionId,
  });
}

// --- Ministry ---

export function useStaffList(page) {
  const token = useToken();
  return useQuery({ queryKey: ['ministry', 'staff', page], queryFn: () => apiClient.get(`/api/ministry/staff?page=${page || 1}`, token), enabled: !!token });
}

export function useCreateStaff() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => apiClient.post('/api/ministry/staff', payload, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ministry', 'staff'] }),
  });
}

export function useUpdateStaff() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ officialId, fullName, phone }) => apiClient.patch(`/api/ministry/staff/${officialId}`, { fullName, phone }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ministry', 'staff'] }),
  });
}

export function useAssignStaffRole() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ officialId, roleName, jurisdictionId }) => apiClient.post(`/api/ministry/staff/${officialId}/roles`, { roleName, jurisdictionId }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ministry', 'staff'] }),
  });
}

export function useRevokeStaff() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (officialId) => apiClient.patch(`/api/ministry/staff/${officialId}/revoke`, {}, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ministry', 'staff'] }),
  });
}

export function useAuditLog(page) {
  const token = useToken();
  return useQuery({ queryKey: ['ministry', 'audit-log', page], queryFn: () => apiClient.get(`/api/ministry/audit-log?page=${page || 1}`, token), enabled: !!token });
}

export function useLanguages() {
  const token = useToken();
  return useQuery({ queryKey: ['ministry', 'languages'], queryFn: () => apiClient.get('/api/ministry/languages', token), enabled: !!token });
}

export function useAddLanguage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, name }) => apiClient.post('/api/ministry/languages', { code, name }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ministry', 'languages'] }),
  });
}

export function useUpdateLanguage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ languageId, code, name }) => apiClient.patch(`/api/ministry/languages/${languageId}`, { code, name }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ministry', 'languages'] }),
  });
}

export function useDeleteLanguage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (languageId) => apiClient.delete(`/api/ministry/languages/${languageId}`, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ministry', 'languages'] }),
  });
}
