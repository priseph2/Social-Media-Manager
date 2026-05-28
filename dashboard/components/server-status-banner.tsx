'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

type Status = 'idle' | 'slow' | 'down';

export function ServerStatusBanner() {
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    let slow: ReturnType<typeof setTimeout>;
    let done = false;

    // Show "waking up" banner after 4s if health check hasn't returned
    slow = setTimeout(() => {
      if (!done) setStatus('slow');
    }, 4000);

    fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(60_000) })
      .then((r) => {
        done = true;
        clearTimeout(slow);
        setStatus(r.ok ? 'idle' : 'down');
      })
      .catch(() => {
        done = true;
        clearTimeout(slow);
        setStatus('down');
      });

    return () => clearTimeout(slow);
  }, []);

  if (status === 'idle') return null;

  if (status === 'slow') {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
        <svg className="w-4 h-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        Server is waking up — this takes about 30–60 seconds on the free tier. Pages will load once it's ready.
      </div>
    );
  }

  return (
    <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-800">
      Cannot reach the server. Please refresh the page or try again in a moment.
    </div>
  );
}
