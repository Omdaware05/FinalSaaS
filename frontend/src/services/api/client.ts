import axios, { AxiosError } from 'axios';

// Relative by default: the app is served same-origin with the backend
// (Vite dev proxy locally, nginx in Docker), so API calls resolve under
// /api/v1 without any baked-in host. Set VITE_API_BASE_URL only for
// split deployments.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000,
});

// Services across the app call mixed paths: some already carry the /api
// prefix ('/api/voice/providers', '/api/model-lab/...') and some don't
// ('/agents', '/stats'). The backend is /api/v1-only now, so strip a
// leading '/api' (or '/api/v1') here and let baseURL supply '/api/v1'.
function normalizeApiUrl(url?: string): string | undefined {
  if (!url) return url;
  if (url.startsWith('/api/v1/')) return url.slice('/api/v1'.length);
  if (url === '/api/v1') return '/';
  if (url.startsWith('/api/')) return url.slice('/api'.length);
  if (url === '/api') return '/';
  return url;
}

// Request interceptor for token injection and active business context
apiClient.interceptors.request.use((config) => {
  config.url = normalizeApiUrl(config.url);
  const token = localStorage.getItem('api_auth_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
    config.headers['X-API-Token'] = token;
  }
  const activeBizId = localStorage.getItem('voxora_active_business_id_v1');
  if (activeBizId && activeBizId !== 'all') {
    config.headers['X-Tenant-ID'] = activeBizId;
    config.headers['X-Business-ID'] = activeBizId;
  }
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string | Array<{ loc?: string[]; msg?: string }> }>) => {
    if (error.response) {
      if (error.response.status === 401) {
        // Dispatched via custom event for UI reaction without hard page reload
        window.dispatchEvent(new CustomEvent('voxora:auth_required'));
      }
    }
    return Promise.reject(error);
  }
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data: any = error.response?.data;
    if (typeof data?.detail === 'string') return data.detail;
    if (typeof data?.message === 'string') return data.message;
    if (data?.detail && typeof data.detail === 'object') {
      if (typeof data.detail.message === 'string') return data.detail.message;
      if (typeof data.detail.detail === 'string') return data.detail.detail;
    }
    if (Array.isArray(data?.detail) && data.detail.length > 0) {
      return data.detail.map((d: any) => d.msg || 'Validation error').join(', ');
    }
    return error.message || 'An unexpected server error occurred';
  }
  if (error instanceof Error) return error.message;
  return 'An unknown error occurred';
}

export default apiClient;
