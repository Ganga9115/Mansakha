// Thin fetch wrapper - attaches the JWT, unwraps the { success, data, message }
// envelope from Build Prompt Section 7, and throws on failure so callers can just
// await and try/catch instead of checking `.success` everywhere.

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const envelope = await res.json();
  if (!envelope.success) {
    throw new Error(envelope.message || 'Request failed');
  }
  return envelope.data;
}

// Raw (non-envelope) GET for the CSV export route, which deliberately
// bypasses {success,data,message} since it's a file download, not a JSON
// API response - returns the Blob directly.
async function downloadBlob(path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error('Export failed');
  return res.blob();
}

export const apiClient = {
  get: (path, token) => request(path, { method: 'GET', token }),
  post: (path, body, token) => request(path, { method: 'POST', body, token }),
  patch: (path, body, token) => request(path, { method: 'PATCH', body, token }),
  delete: (path, token) => request(path, { method: 'DELETE', token }),
  downloadBlob,
};
