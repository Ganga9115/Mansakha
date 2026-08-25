// Token storage for the Staff web app - localStorage, not cookies, since the
// backend is a pure Bearer-token JSON API (see backend/src/utils/jwt.js).
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
