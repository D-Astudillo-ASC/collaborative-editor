function normalizeBaseUrl(base: string): string {
  // Allow empty base to mean "same origin" (useful in dev with Vite proxy).
  if (!base) return '';
  return base.replace(/\/+$/, '');
}

/**
 * Base URL for HTTP API calls.
 *
 * - Dev: leave empty to use Vite proxy (fetch('/api/...')).
 * - Prod (Vercel): set VITE_BACKEND_URL=https://<your-fly-app>.fly.dev
 */
export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_BACKEND_URL || '');

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE_URL) return p;
  return `${API_BASE_URL}${p}`;
}

/**
 * Base URL for Socket.IO.
 *
 * We default to VITE_BACKEND_URL to keep configuration simple.
 */
export const SOCKET_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_SOCKET_URL || API_BASE_URL);
