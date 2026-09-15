// Thin fetch wrapper - attaches the JWT, unwraps the { success, data, message }
// envelope from Build Prompt Section 7, and throws on failure so callers can just
// await and try/catch instead of checking `.success` everywhere.
import { Platform } from 'react-native';

// Use the Mac's LAN IP when running on a physical Android device.
// Use localhost when running on web/Mac.
const API_BASE_URL =
  Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_API_LAN_URL
    : process.env.EXPO_PUBLIC_API_BASE_URL;
    console.log('Platform:', Platform.OS);
console.log('API_BASE_URL:', API_BASE_URL);

// const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000';

// Every screen's loading state (QueryStates.js's QueryBoundary/LoadingState)
// stays on its skeleton for as long as React Query's `isLoading` does - and
// that only ever flips to `isError` (showing the Retry button ErrorState
// already supports) if the underlying fetch promise actually rejects.
// Without a timeout, a genuinely hung request (a dropped connection, a
// backend/DB round trip that never comes back - confirmed reproducible
// against this app's own remote-region database) leaves that fetch pending
// forever, so the skeleton never resolves either way: not to data, not to
// an error. This is what "the page never finishes loading" looks like from
// the outside, independent of how fast the backend *usually* responds.
// Live-measured round trips to this app's own (Seoul-region) database ran
// ~120-200ms typically, ~1.1s on a cold connection - 8s leaves generous
// headroom over any legitimately slow real response while still keeping
// React Query's default retry:3 + backoff worst case (this timeout x ~4
// attempts, plus backoff) closer to ~18-20s than the ~35s a 15s timeout
// produced (confirmed live against a deliberately hung request).
const REQUEST_TIMEOUT_MS = 8000;
// Voice-message uploads carry an audio blob over the wire on top of the same
// remote-database round trip, so they get real headroom instead of racing
// the plain-request budget above.
const UPLOAD_TIMEOUT_MS = 45000;

function withTimeout(timeoutMs, signal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort());
  return { signal: controller.signal, cancel: () => clearTimeout(timeoutId) };
}

async function fetchWithTimeout(url, options) {
  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS, options?.signal);
  try {
    return await fetch(url, { ...options, signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out - check your connection and try again.');
    }
    throw err;
  } finally {
    cancel();
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const envelope = await res.json();
  if (!envelope.success) {
    const error = new Error(envelope.message || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return envelope.data;
}

// Raw (non-envelope) GET for the CSV export route, which deliberately
// bypasses {success,data,message} since it's a file download, not a JSON
// API response - returns the Blob directly.
async function downloadBlob(path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error('Export failed');
  return res.blob();
}

// multipart/form-data POST (e.g. voice message upload) - deliberately does
// NOT set Content-Type itself so fetch can set the multipart boundary, but
// otherwise follows the same envelope-unwrapping/error-throwing contract as
// request() above so callers can treat it like any other apiClient method.
// Uploads can legitimately take longer than a plain GET/POST, so this gets
// its own, longer timeout rather than sharing REQUEST_TIMEOUT_MS.
async function uploadFile(path, formData, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const { signal, cancel } = withTimeout(UPLOAD_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Upload timed out - check your connection and try again.');
    }
    throw err;
  } finally {
    cancel();
  }

  const envelope = await res.json();
  if (!envelope.success) {
    const error = new Error(envelope.message || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return envelope.data;
}

export const apiClient = {
  get: (path, token) => request(path, { method: 'GET', token }),
  post: (path, body, token) => request(path, { method: 'POST', body, token }),
  patch: (path, body, token) => request(path, { method: 'PATCH', body, token }),
  delete: (path, token) => request(path, { method: 'DELETE', token }),
  downloadBlob,
  uploadFile,
};
