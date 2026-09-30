/**
 * The single place where the frontend talks to the backend.
 *
 * Two axios interceptors do the repetitive work:
 *  - the request interceptor attaches the JWT to every call
 *  - the response interceptor unwraps { success, data } and turns API errors
 *    into a normal Error with a readable .message, so components can simply
 *    write try/catch without checking response shapes.
 */
import axios from 'axios';

const TOKEN_KEY = 'sof_token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * Where the API lives.
 *
 *  - Development: '/api', which Vite proxies to http://localhost:5000
 *    (see vite.config.js). Same-origin, so no CORS.
 *
 *  - Netlify: also '/api' by default. A Netlify Function proxies /api/* to the
 *    backend using the private API_ORIGIN environment variable. The browser
 *    still only talks to the Netlify domain, avoiding CORS and mixed content.
 *
 *  - Direct mode: set VITE_API_BASE_URL to the full backend URL
 *    (e.g. https://api.yourdomain.com/api) to skip the proxy. The backend's
 *    CORS whitelist must then include the Netlify domain.
 *
 * Vite replaces import.meta.env.* at build time, so this is decided when you
 * run `npm run build`, not at runtime.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

// --- Attach the token to every request --------------------------------------
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- Unwrap responses and normalise errors ----------------------------------
api.interceptors.response.use(
  (response) => response.data?.data ?? response.data,
  (error) => {
    // The session expired or the token is invalid -> send the user to login.
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
      tokenStorage.clear();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    /**
     * Build a message that actually says what happened.
     *
     * "Something went wrong" was the fallback for every failure that did not
     * carry a JSON body, which hid real causes: a 429 from the rate limiter, a
     * 502 when the API is restarting, a gateway timeout. Naming the status
     * turns an unreportable bug into something you can act on.
     */
    const status = error.response?.status;
    const serverMessage = error.response?.data?.message;

    let message;
    if (serverMessage) {
      message = serverMessage;
    } else if (error.code === 'ERR_NETWORK') {
      message = 'Cannot reach the server. Check your connection and try again.';
    } else if (error.code === 'ECONNABORTED') {
      message = 'The server took too long to respond. Please try again.';
    } else if (status === 429) {
      message = 'Too many attempts. Please wait a few minutes and try again.';
    } else if (status === 502 || status === 503 || status === 504) {
      message = 'The server is temporarily unavailable. Please try again in a moment.';
    } else if (status) {
      message = `Request failed (${status}). Please try again.`;
    } else {
      message = 'Something went wrong. Please try again.';
    }

    const apiError = new Error(message);
    apiError.status = error.response?.status;
    // Field-level validation errors, e.g. [{ field: 'email', message: '...' }]
    apiError.fieldErrors = error.response?.data?.errors || [];
    return Promise.reject(apiError);
  }
);

// ---------------------------------------------------------------------------
// Grouped endpoint helpers -- components call these, never axios directly.
// ---------------------------------------------------------------------------

export const authApi = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  adminLogin: (payload) => api.post('/auth/admin/login', payload),
  me: () => api.get('/auth/me'),
  forgotPassword: (payload) => api.post('/auth/forgot-password', payload),
  resetPassword: (payload) => api.post('/auth/reset-password', payload),
  changePassword: (payload) => api.patch('/auth/password', payload),
};

export const profileApi = {
  get: () => api.get('/profile'),
  update: (payload) => api.put('/profile', payload),
  completeOnboarding: (payload) => api.post('/profile/onboarding', payload),
};

export const opportunityApi = {
  list: (params) => api.get('/opportunities', { params }),
  get: (id) => api.get(`/opportunities/${id}`),
  featured: () => api.get('/opportunities/featured'),
  filters: () => api.get('/opportunities/filters'),
  calendar: (params) => api.get('/opportunities/calendar', { params }),
};

export const savedApi = {
  list: () => api.get('/saved'),
  save: (id) => api.post(`/saved/${id}`),
  unsave: (id) => api.delete(`/saved/${id}`),
};

export const applicationApi = {
  list: () => api.get('/applications'),
  track: (opportunityId, payload) => api.post(`/applications/${opportunityId}`, payload),
  update: (id, payload) => api.patch(`/applications/${id}`, payload),
  remove: (id) => api.delete(`/applications/${id}`),
};

export const recommendationApi = {
  list: (params) => api.get('/recommendations', { params }),
  explain: (id) => api.get(`/recommendations/${id}/explain`),
};

export const notificationApi = {
  list: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  remove: (id) => api.delete(`/notifications/${id}`),
};

export const metaApi = {
  categories: () => api.get('/categories'),
  skills: (search) => api.get('/skills', { params: { search } }),
  interests: () => api.get('/interests'),
  stats: () => api.get('/stats'),
};

export const dashboardApi = {
  get: () => api.get('/dashboard'),
};

export const adminApi = {
  analytics: () => api.get('/admin/analytics'),
  students: (params) => api.get('/admin/students', { params }),
  opportunities: (params) => api.get('/admin/opportunities', { params }),
  createOpportunity: (payload) => api.post('/admin/opportunities', payload),
  updateOpportunity: (id, payload) => api.put(`/admin/opportunities/${id}`, payload),
  deleteOpportunity: (id) => api.delete(`/admin/opportunities/${id}`),
  createCategory: (payload) => api.post('/admin/categories', payload),
  updateCategory: (id, payload) => api.put(`/admin/categories/${id}`, payload),
  deleteCategory: (id) => api.delete(`/admin/categories/${id}`),

  // Automatic ingestion
  ingestion: () => api.get('/admin/ingestion'),
  updateSource: (key, payload) => api.patch(`/admin/ingestion/sources/${key}`, payload),
  pendingReview: () => api.get('/admin/ingestion/pending'),
  review: (id, decision) => api.patch(`/admin/ingestion/review/${id}`, { decision }),
};

export default api;
