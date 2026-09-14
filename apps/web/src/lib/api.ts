/**
 * Prefer same-origin `/api/v1` (Next.js proxies to the Nest API).
 * Override with NEXT_PUBLIC_API_URL only when you intentionally bypass the proxy.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error(
      `Cannot reach API at ${API_URL}. Start the API (npm run dev:api on port 4000) and open the app via http://localhost:3000.`,
    );
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    let message =
      typeof err.message === 'string'
        ? err.message
        : Array.isArray(err.message)
          ? err.message.join(', ')
          : err.message?.message || err.error || 'API error';
    const nestedErrors = Array.isArray(err.errors)
      ? err.errors
      : Array.isArray(err.message?.errors)
        ? err.message.errors
        : null;
    if (nestedErrors?.length) {
      const detail = nestedErrors
        .slice(0, 3)
        .map((e: { row?: number; message?: string }) =>
          e.row != null ? `Row ${e.row}: ${e.message || 'error'}` : e.message || 'error',
        )
        .join('; ');
      message = detail ? `${message} (${detail})` : message;
    }
    throw new Error(message);
  }
  return res.json();
}

export async function login(email: string, password: string) {
  return apiFetch<{ accessToken: string; user: Record<string, unknown> }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}
