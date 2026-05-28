export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function apiRequest<T = unknown>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  if (!token) throw new Error('Authentication required — no session token');
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}
