import axios from 'axios';
import Cookies from 'js-cookie';

/**
 * The single HTTP client for every portal.
 *
 * Previously the student app, admin panel and educator panel each built
 * their own axios instance with slightly different auth/401 behaviour (the
 * admin one even logged users out on any 403). All three `services/api.js`
 * modules now import this instance.
 */
// In production the API is served from the same domain under /api (a
// Netlify Function), so requests use relative URLs. Locally it defaults to
// the Express dev server.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  ?? (import.meta.env.PROD ? '' : 'http://localhost:5000');

export const getAuthToken = () => Cookies.get('userToken');

const http = axios.create({ baseURL: API_BASE_URL });

http.interceptors.request.use((req) => {
  const token = getAuthToken();
  if (token) req.headers.authorization = `Bearer ${token}`;
  return req;
});

const AUTH_FAILURE_CODES = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'USER_NOT_FOUND']);

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    // Only a genuine token failure ends the session. A 403 (permission
    // denied for one resource) is handled by the calling component.
    if (status === 401 && AUTH_FAILURE_CODES.has(code)) {
      Cookies.remove('userToken', { path: '/' });
      Cookies.remove('adminToken', { path: '/' });
      Cookies.remove('userInfo', { path: '/' });
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/** Human-readable message from any API error shape. */
export const errorMessage = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.message
  || error?.response?.data?.error?.message
  || error?.message
  || fallback;

/** Unwraps the `{ success, data }` envelope used by v2 endpoints. */
export const unwrap = (response) => {
  const body = response?.data;
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) return body.data;
  return body;
};

export default http;
