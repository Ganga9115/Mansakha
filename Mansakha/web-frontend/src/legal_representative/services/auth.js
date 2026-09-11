// Token storage for the Staff web app - localStorage, not cookies, since the
// backend is a pure Bearer-token JSON API (see backend/src/core/utils/jwt.js).
// Same shared key every staff role's own copy uses (one staff login active
// per browser tab at a time).
const TOKEN_KEY = 'mansakha_staff_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

export function logout() {
  clearToken();
}
