import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron — fires at 20:00 UTC (8 PM GMT / 9 PM WAT).
 * By this point the /api/cron/wake ping (19:55 UTC) has already confirmed
 * the backend is reachable, so this request should respond quickly.
 *
 * Required Vercel env vars:
 *   NEXT_PUBLIC_API_URL  — backend base URL (e.g. https://your-app.railway.app)
 *   CRON_SECRET          — shared secret (must match Railway env var)
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!BACKEND_URL) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_API_URL not configured' }, { status: 500 });
  }

  try {
    // Server is already warm — 8s is enough for the enqueue calls
    const res = await fetch(`${BACKEND_URL}/api/cron/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      signal: AbortSignal.timeout(8000),
    });

    const body = await res.json().catch(() => ({}));
    return NextResponse.json({ triggered: res.ok, status: res.status, ...body });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ triggered: false, error: message }, { status: 502 });
  }
}
