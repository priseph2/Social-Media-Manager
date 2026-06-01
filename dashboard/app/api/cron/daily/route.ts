import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron — fires at 07:00 UTC (08:00 WAT).
 * By this point the /api/cron/wake ping (06:55 UTC) has already started
 * the Render server, so the backend should respond quickly.
 *
 * Required Vercel env vars:
 *   NEXT_PUBLIC_API_URL  — backend base URL (e.g. https://your-app.onrender.com)
 *   CRON_SECRET          — shared secret (must match Render env var)
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
