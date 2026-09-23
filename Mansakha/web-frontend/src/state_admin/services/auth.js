// Token storage for the Staff web app - sessionStorage, not localStorage, so
// each browser TAB carries its own independent session (see shared/services/
// auth.js's header for the full reasoning). Not cookies, since the backend
// is a pure Bearer-token JSON API (see backend/src/core/utils/jwt.js).
const TOKEN_KEY = 'mansakha_staff_token';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

export function logout() {
  clearToken();
}
