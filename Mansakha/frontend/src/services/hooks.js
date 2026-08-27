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
// Victim Login screen's State/District dropdowns) ---

// `level`: 'state' | 'district'. `parentId`: a state's jurisdictionId,
// required (and the query left disabled without it) when level is 'district'.
export function useJurisdictionOptions(level, parentId) {
  return useQuery({
    queryKey: ['lookups', 'jurisdictions', level, parentId],
    queryFn: () => {
      const params = new URLSearchParams({ level });
      if (parentId) params.set('parentId', parentId);
      return apiClient.get(`/api/lookups/jurisdictions?${params.toString()}`);
    },
    enabled: level === 'state' || !!parentId,
  });
}

export function useLanguageOptions() {
  return useQuery({ queryKey: ['lookups', 'languages'], queryFn: () => apiClient.get('/api/lookups/languages') });
}

// --- Victim ---

// Docket-based login (Feature Catalog: Docket ID + Full Name + Contact
// Number + Password, no OTP/Google) - credentials are provisioned for the
// victim by a District Admin / Data Intake Admin, not self-registered.
// Password is fixed to 'Victim123' at creation; the backend's
// mustChangePassword flag (checked by the caller) forces a real one on
// first login.
export function useVictimLogin() {
  return useMutation({
    mutationFn: ({ docketNumber, fullName, contactNumber, password }) =>
      apiClient.post('/api/auth/victim/login', { docketNumber, fullName, contactNumber, password }),
  });
}

export function useChangeVictimPassword() {
  const { session } = useAuth();
  return useMutation({
    mutationFn: (newPassword) => apiClient.post('/api/auth/victim/change-password', { newPassword }, session?.token),
  });
}

// Reverse-geocodes device GPS coordinates to a state name + matching
// district jurisdictionId, so the Login screen can pre-fill both dropdowns.
// Unauthenticated (called before a session exists).
export function useGpsLookup() {
  return useMutation({ mutationFn: ({ lat, lng }) => apiClient.post('/api/auth/victim/gps-lookup', { lat, lng }) });
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

// `aiAnalysis` is the Check-in screen's local Ollama conversation analysis
// (sentiment/emotion/reason/suggestedIntervention/summary) - see
// services/ollamaClient.js's analyzeConversation(). The backend scores it
// through the same computeDistressScore/alerts/case-note pipeline it always
// has, just sourced from this instead of a server-side Gemini call.
export function useCheckin() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ channel, responses, aiAnalysis }) => apiClient.post('/api/victim/checkin', { channel, responses, aiAnalysis }, token),
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

// --- AI Chat (Feature Catalog: Check-in & Interaction > AI Chat) ---

export function useChatHistory() {
  const token = useToken();
  return useQuery({ queryKey: ['victim', 'chat'], queryFn: () => apiClient.get('/api/victim/chat', token), enabled: !!token });
}

export function useSendChatMessage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message) => apiClient.post('/api/victim/chat', { message }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['victim', 'chat'] }),
  });
}

// --- SOS (Feature Catalog: Check-in & Interaction > SOS button) ---

export function useTriggerSOS() {
  const token = useToken();
  return useMutation({ mutationFn: () => apiClient.post('/api/victim/sos', {}, token) });
}

// --- IVRS call request ---

export function useTriggerIvrsCall() {
  const token = useToken();
  return useMutation({ mutationFn: () => apiClient.post('/api/victim/ivrs/trigger', {}, token) });
}

// --- Wellness & Self-Care ---

export function useWellnessSuggestions(category) {
  const token = useToken();
  return useQuery({
    queryKey: ['victim', 'wellness-suggestions', category],
    queryFn: () => apiClient.get(`/api/victim/wellness-suggestions?category=${category}`, token),
    enabled: !!token,
  });
}

// --- Journal ---

export function useJournalEntries() {
  const token = useToken();
  return useQuery({ queryKey: ['victim', 'journal'], queryFn: () => apiClient.get('/api/victim/journal', token), enabled: !!token });
}

export function useAddJournalEntry() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content) => apiClient.post('/api/victim/journal', { content }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['victim', 'journal'] }),
  });
}

// --- Counsellor preference, in-app chat with assigned counsellor ---

export function useUpdateSmsPreference() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled) => apiClient.patch('/api/victim/sms-preference', { enabled }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['victim', 'dashboard'] }),
  });
}

export function useUpdateCounsellorPreference() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (optedIn) => apiClient.patch('/api/victim/counsellor-preference', { optedIn }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['victim', 'assigned-counsellor'] }),
  });
}

export function useAssignedCounsellor() {
  const token = useToken();
  return useQuery({ queryKey: ['victim', 'assigned-counsellor'], queryFn: () => apiClient.get('/api/victim/assigned-counsellor', token), enabled: !!token });
}

// Feature Catalog Section 2.2 "Scheduled counsellings" - a session the
// assigned Counsellor scheduled (POST /api/counsellor/cases/:victimId/schedule)
// showing up on the victim's own side, so they know to expect a call/visit.
export function useUpcomingSessions() {
  const token = useToken();
  return useQuery({ queryKey: ['victim', 'counselling-sessions'], queryFn: () => apiClient.get('/api/victim/counselling-sessions', token), enabled: !!token });
}

export function useCounsellorMessages() {
  const token = useToken();
  return useQuery({ queryKey: ['victim', 'messages'], queryFn: () => apiClient.get('/api/victim/messages', token), enabled: !!token });
}

export function useSendCounsellorMessage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message) => apiClient.post('/api/victim/messages', { message }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['victim', 'messages'] }),
  });
}
