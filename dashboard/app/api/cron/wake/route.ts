import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron — fires at 19:55 UTC (5 min before the daily content job).
 * Sends a /health ping to the Railway backend to confirm it's reachable,
 * then returns immediately — we do NOT wait for a full response.
 * Railway is always-on so this is just a warm-up confirmation ping.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!BACKEND_URL) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_API_URL not configured' }, { status: 500 });
  }

  // Fire the ping but only wait 4 seconds max — Render will keep waking up
  // even if we abort the request early. The goal is just to start the process.
  fetch(`${BACKEND_URL}/health`, {
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});

  return NextResponse.json({ ok: true, action: 'wake-ping-sent', target: BACKEND_URL });
}
