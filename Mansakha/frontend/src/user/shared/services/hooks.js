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

export function useCaseTypeOptions() {
  return useQuery({ queryKey: ['lookups', 'case-types'], queryFn: () => apiClient.get('/api/lookups/case-types') });
}

// jurisdictionId here is the OFFENSE's district (may differ from the
// victim's own residential district) - the nearest station is who actually
// gets assigned the FIR/investigation, see selfRegistration.js's own
// comment on why these two addresses stay separate fields.
export function useStationOptions(jurisdictionId) {
  return useQuery({
    queryKey: ['lookups', 'police-stations', jurisdictionId],
    queryFn: () => apiClient.get(`/api/lookups/police-stations?jurisdictionId=${jurisdictionId}`),
    enabled: !!jurisdictionId,
  });
}

// --- User ---

// Docket-based login (Feature Catalog: Docket ID + Full Name + Contact
// Number + Password, no OTP/Google) - credentials are provisioned for the
// user by a District Admin / Data Operator, not self-registered.
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

// Self-registration - replaces Data Operator's manual intake entirely, per
// explicit decision. Unauthenticated (no account exists yet); the response
// never carries the password - it's delivered by SMS to contactNumber only.
export function useSelfRegister() {
  return useMutation({
    mutationFn: (payload) => apiClient.post('/api/auth/user/self-register', payload),
  });
}

// Best-effort AI hint for the registration form's case-type dropdown - see
// selfRegistration.js's own comment. Returns { suggestion: null } if
// Ollama is unreachable or unsure, never an error the form needs to handle.
export function useSuggestCaseType() {
  return useMutation({
    mutationFn: (description) => apiClient.post('/api/auth/user/suggest-case-type', { description }),
  });
}

// migration_034: caseUserId (optional) scopes the docket-specific fields
// (docketNumber, caseStatus, rehabilitation) to a SPECIFIC case in the
// caller's own family - defaults to the anchor (today's exact behaviour)
// when omitted. Wellness data (distress score, alerts) always stays
// anchor-scoped regardless - see the backend route's own comment on why.
export function useUserDashboard(caseUserId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'dashboard', caseUserId || null],
    queryFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.get(`/api/user/dashboard${qs}`, token);
    },
    enabled: !!token,
  });
}

// Case Details (Quick Access) - simulated eCourts data for one of the
// caller's own dockets (their own anchor case, or any case linked to it -
// see useUserDashboard's linkedCases, which already lists every docket this
// account can pass here). `userId` is the target docket's own user_id, not
// necessarily the caller's own token identity.
export function useCourtCaseDetails(userId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'court-case', userId],
    queryFn: () => apiClient.get(`/api/user/court-case/${userId}`, token),
    enabled: !!token && !!userId,
  });
}

// Rehabilitation Progress - long-term support (livelihood, housing,
// schooling) run by a Rehabilitation Officer. migration_034: accepts an
// optional caseUserId so the isolated Rehabilitation context can scope this
// to the SPECIFIC docket that's in Rehabilitation, not necessarily the
// caller's own anchor.
export function useRehabilitationProgress(caseUserId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'rehabilitation-progress', caseUserId || null],
    queryFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.get(`/api/user/rehabilitation-progress${qs}`, token);
    },
    enabled: !!token,
  });
}

// Investigation Progress - the Investigating Officer's own curated,
// victim-safe summary (migration_033): accused custody status and
// chargesheet status (both factual, never raw evidence). migration_034:
// accepts an optional caseUserId, same reasoning as useRehabilitationProgress
// above. Entirely separate from useCourtCaseDetails' eCourts simulation -
// this is the real record IO actually maintains.
export function useInvestigationProgress(caseUserId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'investigation-progress', caseUserId || null],
    queryFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.get(`/api/user/investigation-progress${qs}`, token);
    },
    enabled: !!token,
  });
}

// Rehabilitation eligibility/opt-in gate (migration_034) - rehabilitation is
// now a genuine mid-case eCourt stage (Investigation -> Trial ->
// Rehabilitation -> Compensation -> Case Closed), reachable once a specific
// case's own case_stage reaches it, independent of the victim's opt-in
// (a separate fact). caseUserId scopes this to that specific docket - see
// RehabilitationOptInScreen.js / RehabilitationDecisionGate.js.
export function useRehabilitationEligibility(caseUserId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'rehabilitation-eligibility', caseUserId || null],
    queryFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.get(`/api/user/rehabilitation-eligibility${qs}`, token);
    },
    enabled: !!token,
  });
}

// migration_034: opting in no longer touches case_stage (eCourt owns that
// exclusively) - it only records the victim's own decision
// (rehabilitation_opted_in_at) against a SPECIFIC docket, so caseUserId is
// required here whenever the decision concerns a case other than the
// caller's own anchor (see RehabilitationDecisionGate.js).
export function useOptInRehabilitation(caseUserId) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId) => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.post(`/api/user/rehabilitation-opt-in${qs}`, { providerId }, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'rehabilitation-eligibility'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'rehabilitation-progress'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
    },
  });
}

// The Rehabilitation decision gate's "No" answer - migration_034: this no
// longer deactivates the account. It only records
// rehabilitation_declined_at against the specific docket; that case simply
// continues under normal (non-isolated) tracking, and when it eventually
// reaches Case Closed it's treated as an ordinary closed case, not a
// rehabilitation one. See RehabilitationDecisionGate.js.
export function useDeclineRehabilitation(caseUserId) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.post(`/api/user/rehabilitation-decline${qs}`, {}, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'rehabilitation-eligibility'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
    },
  });
}

// migration_034 - the special post-closure Rehabilitation continuation
// flow: when a case that was in Rehabilitation (with the victim opted in)
// gets marked Case Closed by eCourt, the victim is asked whether they still
// want to continue using the app / continue Rehabilitation. See
// RehabilitationClosureGate.js.
export function useRehabilitationClosureStatus(caseUserId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'rehabilitation-closure-status', caseUserId || null],
    queryFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.get(`/api/user/rehabilitation-closure-status${qs}`, token);
    },
    enabled: !!token,
  });
}

// "Yes" - continue using the app / continue Rehabilitation, treating the
// court case itself as closed.
export function useContinueRehabilitationAfterClosure(caseUserId) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.post(`/api/user/rehabilitation-closure-continue${qs}`, {}, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'rehabilitation-closure-status'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
    },
  });
}

// "No" - end Rehabilitation access for this now-closed case; the app
// returns to the victim's other remaining active-case context.
export function useEndRehabilitationAfterClosure(caseUserId) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.post(`/api/user/rehabilitation-closure-end${qs}`, {}, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'rehabilitation-closure-status'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
    },
  });
}

// Legal Aid (consolidated DLSA flow) - victim-initiated, available at any
// case stage, not gated behind case closure the way rehabilitation is.
export function useLegalAidStatus() {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'legal-aid-status'],
    queryFn: () => apiClient.get('/api/user/legal-aid-status', token),
    enabled: !!token,
  });
}

export function useRequestLegalAid() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason) => apiClient.post('/api/user/legal-aid-request', { reason }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'legal-aid-status'] }),
  });
}

export function useSubmitLegalAidFeedback() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rating, comment }) => apiClient.post('/api/user/legal-aid-feedback', { rating, comment }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'legal-aid-status'] }),
  });
}

// Legal Aid (migration_040, dedicated pipeline) - replaces the consolidated
// flow above for NEW requests (the 3 hooks above stay, unmodified, purely to
// power the legacyRequestFound fallback banner on a case whose Legal Aid was
// already accepted under the old flow). Real lifecycle, existing case
// documents auto-linked server-side (not re-uploaded), a real assigned
// Public Prosecutor (not a free-text name). migration_044: feedback is
// removed application-wide; hearings are eCourt-only.

export function useMyLegalAidRequestCurrent(caseUserId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'legal-aid-requests', 'current', caseUserId || null],
    queryFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.get(`/api/user/legal-aid-requests/current${qs}`, token);
    },
    enabled: !!token,
  });
}

export function useSubmitLegalAidRequest(caseUserId) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reason, description }) => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.post(`/api/user/legal-aid-requests${qs}`, { reason, description }, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'legal-aid-requests'] }),
  });
}

// Same web/native FormData branch as useUploadInterventionDocument above.
export function useUploadLegalAidDocument() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, documentLabel, uri, mimeType }) => {
      const formData = new FormData();
      const type = mimeType || 'image/jpeg';
      const ext = type.includes('png') ? 'png' : type.includes('pdf') ? 'pdf' : 'jpg';
      if (Platform.OS === 'web') {
        const blob = await fetch(uri).then((r) => r.blob());
        formData.append('file', blob, `document.${ext}`);
      } else {
        formData.append('file', { uri, name: `document.${ext}`, type });
      }
      formData.append('documentLabel', documentLabel);
      return apiClient.uploadFile(`/api/user/legal-aid-requests/${requestId}/documents`, formData, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'legal-aid-requests'] }),
  });
}

export function useLegalAidRepresentative(requestId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'legal-aid-requests', requestId, 'representative'],
    queryFn: () => apiClient.get(`/api/user/legal-aid-requests/${requestId}/representative`, token),
    enabled: !!token && !!requestId,
  });
}

export function useLegalAidHearings(requestId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'legal-aid-requests', requestId, 'hearings'],
    queryFn: () => apiClient.get(`/api/user/legal-aid-requests/${requestId}/hearings`, token),
    enabled: !!token && !!requestId,
  });
}

// Threat (consolidated Protection Officer flow) - victim-initiated, no
// case_stage gate, jurisdiction-routed to "the nearby officer" server-side.
export function useThreatStatus() {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'threat-status'],
    queryFn: () => apiClient.get('/api/user/threat-status', token),
    enabled: !!token,
  });
}

// useReportThreat removed - "Report a Threat" was retired as a separate
// victim action (it duplicated the Emergency Call's destination). Urgent
// danger goes through useTriggerUrgentHelp; planned protection goes through
// the Witness Protection / Relocation intervention request. useThreatStatus
// below still reads whichever protection referral resulted.
// DWO Financial Aid (Immediate Relief) - victim-initiated, no case_stage
// gate, urgent need can arise at any point in the case.
export function useFinancialAidStatus() {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'financial-aid-status'],
    queryFn: () => apiClient.get('/api/user/financial-aid-status', token),
    enabled: !!token,
  });
}

export function useRequestFinancialAid() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason) => apiClient.post('/api/user/financial-aid-request', { reason }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'financial-aid-status'] }),
  });
}

export function useConfirmFinancialAid() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/api/user/financial-aid-confirm', {}, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'financial-aid-status'] }),
  });
}

// Compensation Module - read-only for the victim. Available the moment a
// case is registered (auto-suggested category/amount), independent of any
// DWO referral - once DWO verifies an exact figure, this reflects that
// instead, with the live 3-stage payment tracker.
export function useCompensationStatus(caseUserId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'compensation-status', caseUserId || null],
    queryFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.get(`/api/user/compensation-status${qs}`, token);
    },
    enabled: !!token,
  });
}

// --- Victim-Initiated Intervention Requests (User -> District Admin; see
// migration_027_intervention_requests.sql) - replaces the old Counsellor-
// recommended intervention feature entirely. Counselling is deliberately
// excluded from the type list the backend returns here (it has its own
// simpler opt-in path, see useUpdateCounsellorPreference above). ---

// migration_036: 5 eligible types (Medical, Witness Protection, Relocation,
// Financial Assistance, Legal Aid) with their requiredDocuments - drives the
// request form's type picker and per-type document checklist. Rehabilitation
// removed - it was never actually reviewed by any role's queue (a dead end
// stuck at "Pending" forever); the real Rehabilitation flow is the
// dedicated, stage-gated opt-in reachable once case_stage = 'Rehabilitation'
// (see RehabilitationOptInScreen.js / RehabilitationDecisionGate.js).
export function useInterventionTypes() {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'intervention-types'],
    queryFn: () => apiClient.get('/api/user/intervention-types', token),
    enabled: !!token,
  });
}

// Scoped to whichever docket is currently active (?caseUserId=,
// resolveCaseUserId server-side) - same docket Case Details/Compensation/
// Rehabilitation are already driven by via ActiveCaseContext, so switching
// docket in Settings/Profile changes this list too, not just the ones filed
// while that docket was active.
export function useMyInterventionRequests(caseUserId) {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'intervention-requests', caseUserId || null],
    queryFn: () => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.get(`/api/user/intervention-requests${qs}`, token);
    },
    enabled: !!token,
  });
}

// caseUserId matters here: the reviewing officer's queue is
// jurisdiction-scoped, so a request must be filed against the case whose
// district it actually concerns. Filing everything against the anchor meant
// a victim with cases in two districts had requests land on the wrong one,
// where the officer for the relevant district never saw them.
export function useSubmitInterventionRequest(caseUserId) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interventionTypeId, description }) => {
      const qs = caseUserId ? `?caseUserId=${caseUserId}` : '';
      return apiClient.post(`/api/user/intervention-requests${qs}`, { interventionTypeId, description }, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'intervention-requests'] }),
  });
}

// `uri` is whatever expo-image-picker returned (a photo of the physical
// document - the realistic path for most of these proofs, e.g. a caste
// certificate or FIR copy someone only holds on paper). Mirrors
// useSendCounsellorVoiceMessage's exact platform-branch for turning a
// picked file into the right FormData shape on web vs native.
export function useUploadInterventionDocument() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, documentLabel, uri, mimeType }) => {
      const formData = new FormData();
      const type = mimeType || 'image/jpeg';
      const ext = type.includes('png') ? 'png' : type.includes('pdf') ? 'pdf' : 'jpg';
      if (Platform.OS === 'web') {
        const blob = await fetch(uri).then((r) => r.blob());
        formData.append('file', blob, `proof.${ext}`);
      } else {
        formData.append('file', { uri, name: `proof.${ext}`, type });
      }
      formData.append('documentLabel', documentLabel);
      return apiClient.uploadFile(`/api/user/intervention-requests/${requestId}/documents`, formData, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'intervention-requests'] }),
  });
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
    mutationFn: ({ channel, responses, aiAnalysis, audioBase64 }) => apiClient.post('/api/user/checkin', { channel, responses, aiAnalysis, audioBase64 }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['user', 'distress-history'] });
    },
  });
}

// Persists one AI-chat exchange (both sides at once) and, server-side, fires
// an Ollama-scored distress reading once the running word count crosses
// 5,000 - see POST /api/user/chat/log. Fire-and-forget from the caller's
// perspective (ChatScreen.js doesn't need to block on this to keep
// chatting), but still surfaces errors so a persistent failure isn't silent.
// `channel`: 'text' | 'voice_call' | 'video_call' (migration_047) - defaults
// to 'text' for ChatScreen.js's own composer; MansakhaCallModal.js passes
// 'voice_call'/'video_call' explicitly per its own call mode.
export function useLogChatTurn() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userMessage, aiMessage, channel = 'text' }) => apiClient.post('/api/user/chat/log', { userMessage, aiMessage, channel }, token),
    onSuccess: (data, variables) => {
      if (data?.scored) {
        queryClient.invalidateQueries({ queryKey: ['user', 'dashboard'] });
      }
      if ((variables?.channel || 'text') === 'text') {
        queryClient.invalidateQueries({ queryKey: ['user', 'chat', 'text'] });
      }
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

// Recent AI-authored case-note excerpts, used by CheckinScreen.js to give the
// on-device question generator some continuity with past sessions.
// CheckinScreen.js previously read this via a raw fetch() using an env var
// (EXPO_PUBLIC_API_URL) and an AsyncStorage key (user_jwt) neither of which
// this app actually sets anywhere - the real names are
// EXPO_PUBLIC_API_BASE_URL/EXPO_PUBLIC_API_LAN_URL (apiClient.js) and the
// mansakha_session blob (AuthContext.js) - so both calls always silently
// fell back to a hardcoded localhost URL with no token attached, working
// only by accident on a dev machine colocated with the backend.
export function useUserHistory() {
  const token = useToken();
  return useQuery({ queryKey: ['user', 'history'], queryFn: () => apiClient.get('/api/user/history', token), enabled: !!token });
}

// Fire-and-forget async save of one in-progress check-in exchange - see this
// route's own backend comment (user.routes.js) for why it's a no-op today
// beyond acknowledging the write.
export function useAppendInteraction() {
  const token = useToken();
  return useMutation({
    mutationFn: (text) => apiClient.post('/api/user/interaction/append', { text }, token),
  });
}

// --- AI Chat (Feature Catalog: Check-in & Interaction > AI Chat) ---

// `channel`: 'text' | 'voice_call' | 'video_call' | undefined (every
// channel). ChatScreen.js's own typed-message thread requests channel=text
// specifically - a live voice/video call's turns are recorded server-side
// (migration_047) for scoring/analytics but were never typed bubbles, so
// they don't get replayed back into that thread on reload.
export function useChatHistory(channel) {
  const token = useToken();
  const qs = channel ? `?channel=${channel}` : '';
  return useQuery({ queryKey: ['user', 'chat', channel || 'all'], queryFn: () => apiClient.get(`/api/user/chat${qs}`, token), enabled: !!token });
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
// nationwide) and the Protection Officer for the user's district only -
// District/State Administration are deliberately not alerted here. Returns
// { sosEventId, triggeredAt, pcrNumber, contactNumber } - the caller dials
// `tel:${pcrNumber}` client-side, since the backend's IVRS/Exotel dispatch
// is a deliberate stub that doesn't actually place calls.
export function useTriggerUrgentHelp() {
  const token = useToken();
  return useMutation({ mutationFn: (location) => apiClient.post('/api/user/urgent-help', { location }, token) });
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

// The header bell used to just navigate to the static Support page - this is
// real data behind it now (unread counsellor messages + upcoming scheduled
// sessions), via the same /api/me/notifications the staff bell already uses.
export function useMyNotifications({ enabled = true } = {}) {
  const token = useToken();
  return useQuery({ queryKey: ['user', 'notifications'], queryFn: () => apiClient.get('/api/me/notifications', token), enabled: !!token && enabled });
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

// migration_038 - the bank account statutory compensation is disbursed
// into (DBT). Held against the person, not one docket, so this takes no
// caseUserId. Proof is optional supporting evidence, never a gate on
// recording the account - same reasoning migration_036 applied to the
// intervention types.
export function useBankDetails() {
  const token = useToken();
  return useQuery({
    queryKey: ['user', 'bank-details'],
    queryFn: () => apiClient.get('/api/user/bank-details', token),
    enabled: !!token,
  });
}

export function useSaveBankDetails() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (details) => apiClient.patch('/api/user/bank-details', details, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'bank-details'] }),
  });
}

// migration_038 - optional passbook / cancelled-cheque proof for the bank
// account compensation is paid into. Deliberately optional: recording where
// to send statutory relief should not be blocked behind paperwork (same
// reasoning migration_036 applied to the intervention types) - the District
// Welfare Officer verifies before actually disbursing. Mirrors
// useUploadInterventionDocument's own web-vs-native FormData branch.
export function useUploadBankProof() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uri, mimeType }) => {
      const formData = new FormData();
      const type = mimeType || 'image/jpeg';
      const ext = type.includes('png') ? 'png' : type.includes('pdf') ? 'pdf' : 'jpg';
      if (Platform.OS === 'web') {
        const blob = await fetch(uri).then((r) => r.blob());
        formData.append('file', blob, `bank-proof.${ext}`);
      } else {
        formData.append('file', { uri, name: `bank-proof.${ext}`, type });
      }
      return apiClient.uploadFile('/api/user/bank-details/proof', formData, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user', 'bank-details'] }),
  });
}
