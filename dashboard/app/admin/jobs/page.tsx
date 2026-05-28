'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

import { API_URL as API, timedFetch } from '@/lib/api';

interface QueueStats {
  available: boolean;
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  paused?: number;
  error?: string;
}

interface FailedJob {
  queue: string;
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: string;
  tenantId: string | null;
}

interface JobsData {
  available: boolean;
  queues: Record<string, QueueStats>;
}

const QUEUE_LABELS: Record<string, string> = {
  content: 'Content Generator',
  social: 'Social Media',
  email: 'Email Campaigns',
  'customer-service': 'Customer Service',
  analytics: 'Analytics Monitor',
  'brand-review': 'Brand Guardian',
  ecommerce: 'E-Commerce',
  orchestrator: 'Orchestrator',
};

function CountBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg ${color}`}>
      <span className="text-xl font-bold">{value ?? 0}</span>
      <span className="text-xs uppercase tracking-wide mt-0.5">{label}</span>
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobsData | null>(null);
  const [failed, setFailed] = useState<FailedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [cleaning, setCleaning] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async (tok?: string) => {
    const t = tok || token;
    if (!t) return;
    try {
      const [qRes, fRes] = await Promise.all([
        fetch(`${API}/api/admin/jobs`, { headers: { Authorization: `Bearer ${t}` } }),
        fetch(`${API}/api/admin/jobs/failed`, { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      if (qRes.ok) setJobs(await qRes.json());
      if (fRes.ok) setFailed((await fRes.json()).jobs);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setToken(session.access_token);
      await load(session.access_token);
    }
    init();
  }, []);

  async function cleanQueue(queueName: string) {
    setCleaning(queueName);
    try {
      await timedFetch(`${API}/api/admin/jobs/${queueName}/clean`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await load();
    } finally {
      setCleaning(null);
    }
  }

  const totalFailed = jobs ? Object.values(jobs.queues).reduce((s, q) => s + (q.failed || 0), 0) : 0;
  const totalActive = jobs ? Object.values(jobs.queues).reduce((s, q) => s + (q.active || 0), 0) : 0;
  const totalWaiting = jobs ? Object.values(jobs.queues).reduce((s, q) => s + (q.waiting || 0), 0) : 0;

  if (loading) return <div className="p-4 sm:p-8 text-sm text-slate-500">Loading…</div>;
  if (error) return <div className="p-4 sm:p-8 text-sm text-red-600">{error}</div>;

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Job Queues</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {!jobs?.available ? 'Redis unavailable' : `${lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}`}
          </p>
        </div>
        <button
          onClick={() => load()}
          className="px-4 py-2 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {!jobs?.available ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">
          Redis is not configured or unavailable. Queue monitoring requires a Redis connection.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Active Now</p>
              <p className="text-3xl font-bold text-emerald-600">{totalActive}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Waiting</p>
              <p className="text-3xl font-bold text-amber-500">{totalWaiting}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Failed</p>
              <p className={`text-3xl font-bold ${totalFailed > 0 ? 'text-red-600' : 'text-slate-400'}`}>{totalFailed}</p>
            </div>
          </div>

          {/* Per-queue cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {Object.entries(jobs.queues).map(([name, stats]) => (
              <div key={name} className={`bg-white rounded-xl border p-5 ${!stats.available ? 'opacity-60' : ''} ${(stats.failed || 0) > 0 ? 'border-red-200' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">{QUEUE_LABELS[name] || name}</h3>
                    <p className="text-xs text-slate-400 font-mono">{name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(stats.failed || 0) > 0 && (
                      <button
                        onClick={() => cleanQueue(name)}
                        disabled={cleaning === name}
                        className="px-2.5 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                      >
                        {cleaning === name ? 'Cleaning…' : 'Clean failed'}
                      </button>
                    )}
                    <span className={`w-2 h-2 rounded-full ${stats.available ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  </div>
                </div>
                {!stats.available ? (
                  <p className="text-xs text-slate-400">{stats.error || 'Unavailable'}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <CountBadge label="Wait" value={stats.waiting ?? 0} color="bg-slate-50 text-slate-600" />
                    <CountBadge label="Active" value={stats.active ?? 0} color="bg-emerald-50 text-emerald-700" />
                    <CountBadge label="Done" value={stats.completed ?? 0} color="bg-indigo-50 text-indigo-700" />
                    <CountBadge label="Failed" value={stats.failed ?? 0} color={(stats.failed ?? 0) > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-400'} />
                    <CountBadge label="Delay" value={stats.delayed ?? 0} color="bg-amber-50 text-amber-700" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Failed jobs */}
          {failed.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200">
              <div className="px-5 py-4 border-b border-red-100">
                <h2 className="text-sm font-semibold text-red-700">Failed Jobs</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-red-50">
                  <tr className="text-left text-xs text-red-600 uppercase tracking-wide border-b border-red-100">
                    <th className="px-4 py-2.5 font-medium">Queue</th>
                    <th className="px-4 py-2.5 font-medium">Job</th>
                    <th className="px-4 py-2.5 font-medium">Error</th>
                    <th className="px-4 py-2.5 font-medium">Tenant</th>
                    <th className="px-4 py-2.5 font-medium">Attempts</th>
                    <th className="px-4 py-2.5 font-medium text-right">Failed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-50">
                  {failed.map((j) => (
                    <tr key={`${j.queue}-${j.id}`} className="hover:bg-red-50">
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{j.queue}</td>
                      <td className="px-4 py-2.5 text-slate-700 font-medium">{j.name}</td>
                      <td className="px-4 py-2.5 text-xs text-red-600 max-w-xs truncate" title={j.failedReason}>{j.failedReason}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{j.tenantId?.slice(0, 8) || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{j.attemptsMade}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-400">{new Date(j.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
