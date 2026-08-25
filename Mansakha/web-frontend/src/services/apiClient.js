// Thin fetch wrapper - same pattern as frontend/src/services/apiClient.js
// (the Expo app): attaches the JWT, unwraps the {success, data, message}
// envelope every backend route returns, and throws on failure so callers
// just await/try-catch instead of checking `.success` everywhere.

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

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

// Multipart upload - no Content-Type header set manually so the browser
// fills in the correct multipart boundary itself.
async function uploadFile(path, formData, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers, body: formData });
  const envelope = await res.json();
  if (!envelope.success) throw new Error(envelope.message || 'Upload failed');
  return envelope.data;
}

export const apiClient = {
  get: (path, token) => request(path, { method: 'GET', token }),
  post: (path, body, token) => request(path, { method: 'POST', body, token }),
  patch: (path, body, token) => request(path, { method: 'PATCH', body, token }),
  delete: (path, token) => request(path, { method: 'DELETE', token }),
  uploadFile,
};
