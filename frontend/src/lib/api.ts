// API calls go through the Next.js same-origin proxy (/backend-api -> backend /api).
// When built with a basePath (NEXT_PUBLIC_BASE_PATH), rewrites are served under that
// prefix too, so the default composes both. NEXT_PUBLIC_API_URL always wins if set.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const API_BASE: string =
  (process.env.NEXT_PUBLIC_API_URL as string) || `${BASE_PATH}/backend-api`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...init,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || `HTTP ${res.status}`;
    const err: any = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: any) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T,>(path: string, body?: any) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T,>(path: string, body?: any) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
};
