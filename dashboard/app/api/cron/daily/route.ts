import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Vercel Cron — fires daily at 07:00 UTC (08:00 WAT).
 * Calls the backend /api/cron/trigger endpoint which wakes the Render
 * server and kicks off daily content generation for all active tenants.
 *
 * Configure in Vercel dashboard:
 *   CRON_SECRET  — shared secret (must match the backend env var)
 *   API_URL      — backend base URL (e.g. https://your-app.onrender.com)
 */
export async function GET(req: NextRequest) {
  // Vercel signs cron requests with the Authorization header when
  // CRON_SECRET is set in the project settings.
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!BACKEND_URL) {
    return NextResponse.json({ error: 'API_URL not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/cron/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      signal: AbortSignal.timeout(25000),
    });

    const body = await res.json().catch(() => ({}));
    return NextResponse.json({ triggered: res.ok, status: res.status, ...body });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ triggered: false, error: message }, { status: 502 });
  }
}
