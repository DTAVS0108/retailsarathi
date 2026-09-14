export function createApiFetch(apiUrl: string) {
  const base = apiUrl.replace(/\/$/, '');
  return async function apiFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
    const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { message?: string }).message || `API ${res.status}`);
    }
    return data as T;
  };
}

export type ApiFetch = <T>(token: string, path: string, init?: RequestInit) => Promise<T>;

/** Resolve `/uploads/...` paths against the API host. */
export function resolveUploadUrl(apiUrl: string, path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const origin = apiUrl.replace(/\/$/, '').replace(/\/api\/v1$/i, '');
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.toLowerCase().lastIndexOf('/uploads/');
  const rel = idx >= 0 ? normalized.slice(idx) : normalized.startsWith('/') ? normalized : null;
  if (!rel) return null;
  return `${origin}${rel}`;
}
