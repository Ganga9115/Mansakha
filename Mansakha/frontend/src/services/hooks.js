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
