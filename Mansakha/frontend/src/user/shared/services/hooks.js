import { Platform } from 'react-native';
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
// User Login screen's State/District dropdowns) ---

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

// --- User ---

// Docket-based login (Feature Catalog: Docket ID + Full Name + Contact
// Number + Password, no OTP/Google) - credentials are provisioned for the
// user by a District Admin / Data Intake Admin, not self-registered.
// Password is fixed to 'User123' at creation; the backend's
// mustChangePassword flag (checked by the caller) forces a real one on
// first login.
export function useUserLogin() {
  return useMutation({
    mutationFn: ({ docketNumber, password }) =>
      apiClient.post('/api/auth/user/login', { docketNumber, password }),
  });
}

export function useChangeUserPassword() {
  const { session } = useAuth();
  return useMutation({
    mutationFn: (newPassword) => apiClient.post('/api/auth/user/change-password', { newPassword }, session?.token),
  });
}

// Reverse-geocodes device GPS coordinates to a state name + matching
// district jurisdictionId, so the Login screen can pre-fill both dropdowns.
// Unauthenticated (called before a session exists).
export function useGpsLookup() {
  return useMutation({ mutationFn: ({ lat, lng }) => apiClient.post('/api/auth/user/gps-lookup', { lat, lng }) });
}

export function useUserDashboard() {
  const token = useToken();
  return useQuery({ queryKey: ['user', 'dashboard'], queryFn: () => apiClient.get('/api/user/dashboard', token), enabled: !!token });
}

export function useConsentStatus() {
  const token = useToken();
  return useQuery({ queryKey: ['user', 'consent-status'], queryFn: () => apiClient.get('/api/user/consent-status', token), enabled: !!token });
}

export function useSubmitConsent() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channel) => apiClient.post('/api/user/consent', { channel }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'consent-status'] }),
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
    mutationFn: ({ channel, responses, aiAnalysis }) => apiClient.post('/api/user/checkin', { channel, responses, aiAnalysis }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'distress-history'] });
    },
  });
}

export function useQuestionnaireNext() {
  const token = useToken();
  return useMutation({
    mutationFn: ({ currentQuestionIndex, previousResponses }) => 
      apiClient.post('/api/user/questionnaire/next', { currentQuestionIndex, previousResponses }, token),
  });
}

export function useQuestionnaireSubmit() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ allResponses }) => 
      apiClient.post('/api/user/questionnaire/submit', { allResponses }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'distress-history'] });
    },
  });
}

export function useUpdateUserLanguage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (languageId) => apiClient.patch('/api/user/language', { languageId }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] }),
  });
}

export function useDistressHistory() {
  const token = useToken();
  return useQuery({ queryKey: ['user', 'distress-history'], queryFn: () => apiClient.get('/api/user/distress-history', token), enabled: !!token });
}

// --- AI Chat (Feature Catalog: Check-in & Interaction > AI Chat) ---

export function useChatHistory() {
  const token = useToken();
  return useQuery({ queryKey: ['user', 'chat'], queryFn: () => apiClient.get('/api/user/chat', token), enabled: !!token });
}

export function useSendChatMessage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message) => apiClient.post('/api/user/chat', { message }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'chat'] }),
  });
}

// --- IVRS call request ---

export function useTriggerIvrsCall() {
  const token = useToken();
  return useMutation({ mutationFn: () => apiClient.post('/api/user/ivrs/trigger', {}, token) });
}

// --- Get Help Now / urgent-help (replaces the old SOS button) ---

// Notifies the assigned counsellor (or auto-assigns the least-loaded one
// nationwide), every District Administration official in the user's
// district, and every State Administration official in that district's
// parent state. Returns { sosEventId, triggeredAt, pcrNumber,
// contactNumber } - the caller dials `tel:${pcrNumber}` client-side, since
// the backend's IVRS/Exotel dispatch is a deliberate stub that doesn't
// actually place calls.
export function useTriggerUrgentHelp() {
  const token = useToken();
  return useMutation({ mutationFn: () => apiClient.post('/api/user/urgent-help', {}, token) });
}

// --- Wellness & Self-Care ---

export function useWellnessSuggestions(category) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'wellness-suggestions', category],
    queryFn: () => apiClient.get(`/api/user/wellness-suggestions?category=${category}`, token),
    enabled: !!token,
  });
}

// --- Journal ---

export function useJournalEntries() {
  const token = useToken();
  return useQuery({ queryKey: ['user', 'journal'], queryFn: () => apiClient.get('/api/user/journal', token), enabled: !!token });
}

export function useAddJournalEntry() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ title, content }) => apiClient.post('/api/user/journal', { title, content }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'journal'] }),
  });
}

export function useUpdateJournalEntry() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, title, content }) => apiClient.patch(`/api/user/journal/${entryId}`, { title, content }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'journal'] }),
  });
}

export function useDeleteJournalEntry() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId) => apiClient.delete(`/api/user/journal/${entryId}`, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'journal'] }),
  });
}

// --- Counsellor preference, in-app chat with assigned counsellor ---

export function useUpdateSmsPreference() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled) => apiClient.patch('/api/user/sms-preference', { enabled }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] }),
  });
}

export function useUpdateCounsellorPreference() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (optedIn) => apiClient.patch('/api/user/counsellor-preference', { optedIn }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'assigned-counsellor'] }),
  });
}

// Pings the backend to mark this user as actively typing in the counsellor
// chat - the counsellor's own message-polling response surfaces this back
// as `otherPartyTyping`. Callers should throttle calls to roughly once
// every 1.5-2s while typing, not on every keystroke.
export function useSendTypingPing() {
  const token = useToken();
  return useMutation({ mutationFn: () => apiClient.post('/api/user/messages/typing', {}, token) });
}

export function useAssignedCounsellor() {
  const token = useToken();
  return useQuery({ queryKey: ['user', 'assigned-counsellor'], queryFn: () => apiClient.get('/api/user/assigned-counsellor', token), enabled: !!token });
}


// Feature Catalog Section 2.2 "Scheduled counsellings" - a session the
// assigned Counsellor scheduled (POST /api/counsellor/cases/:userId/schedule)
// showing up on the user's own side, so they know to expect a call/visit.
export function useUpcomingSessions() {
  const token = useToken();
  return useQuery({ queryKey: ['user', 'counselling-sessions'], queryFn: () => apiClient.get('/api/user/counselling-sessions', token), enabled: !!token });
}

// In-app chat with the assigned counsellor (replaces the WhatsApp redirect).
// Polled every 3s while a screen using this is mounted (react-query pauses
// refetchInterval once unmounted) for "live enough" delivery without a
// WebSocket - a support chat, not a fast-paced consumer messenger.
export function useCounsellorMessages() {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'messages'],
    queryFn: () => apiClient.get('/api/user/messages', token),
    enabled: !!token,
    refetchInterval: 3000,
  });
}

export function useSendCounsellorMessage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    // The backend route reads req.body.body (matching the counsellor-side
    // POST /api/counsellor/cases/:userId/messages contract) - this was
    // previously sending { message }, which the server always rejected with
    // "body is required".
    mutationFn: (message) => apiClient.post('/api/user/messages', { body: message }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'messages'] }),
  });
}

// WhatsApp-style recorded voice note - `uri` is whatever the audio package's
// recorder produced (a file:// URI on native, a blob: URI on web).
// FormData's file-part shape differs by platform: React Native's fetch
// polyfill wants the {uri,name,type} object form, while a real browser
// FormData only accepts a Blob/File (an object literal there just gets
// stringified to "[object Object]"), so a blob: URI is re-fetched into an
// actual Blob first.
export function useSendCounsellorVoiceMessage() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uri, durationSeconds }) => {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const blob = await fetch(uri).then((r) => r.blob());
        const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('ogg') ? 'ogg' : blob.type.includes('wav') ? 'wav' : 'm4a';
        formData.append('audio', blob, `voice-message.${ext}`);
      } else {
        const ext = (uri.split('.').pop() || 'm4a').toLowerCase();
        formData.append('audio', { uri, name: `voice-message.${ext}`, type: `audio/${ext}` });
      }
      formData.append('duration', String(Math.max(1, Math.round(durationSeconds || 0))));
      return apiClient.uploadFile('/api/user/messages/voice', formData, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'messages'] }),
  });
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  console.log('API URL:', `${API_BASE_URL}${path}`);
  console.log('METHOD:', method);
  console.log('BODY:', body);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    console.log('STATUS:', res.status);

    const envelope = await res.json();

    console.log('RESPONSE:', envelope);

    if (!envelope.success) {
      const error = new Error(envelope.message || 'Request failed');
      error.status = res.status;
      throw error;
    }

    return envelope.data;
  } catch (error) {
    console.error('API REQUEST FAILED:', error);
    throw error;
  }
}
