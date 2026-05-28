export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Render free tier cold-starts can take up to 60s — use a generous timeout
// so pages fail with a clear error rather than hanging forever.
const REQUEST_TIMEOUT_MS = 60_000;

export async function apiRequest<T = unknown>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  if (!token) throw new Error('Authentication required — no session token');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Request timed out — the server may be starting up. Please try again in a moment.');
    }
    throw new Error('Failed to reach the server. Please check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Drop-in replacement for fetch() with the same 60s timeout.
// Use in admin pages instead of raw fetch() so cold-start hangs are avoided.
export async function timedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Request timed out — the server may be starting up. Please try again in a moment.');
    }
    throw new Error('Failed to reach the server. Please check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}
