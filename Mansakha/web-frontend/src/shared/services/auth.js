// Token storage for the Staff web app - sessionStorage, not localStorage, so
// each browser TAB carries its own independent session. localStorage is
// shared across every tab of the same origin, so signing in as one official
// in a second tab silently overwrote (or hijacked) whatever session was
// active in the first - the opposite of what a portal any number of
// officials use at once needs. sessionStorage is scoped per tab by design,
// so opening N tabs lets N different accounts (same role or different
// roles) stay signed in side by side. Not cookies, since the backend is a
// pure Bearer-token JSON API (see backend/src/core/utils/jwt.js).
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
