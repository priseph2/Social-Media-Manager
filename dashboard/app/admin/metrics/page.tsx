'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

import { API_URL as API } from '@/lib/api';

interface RealtimeMetrics {
  opsLastHour: number;
  failedLastHour: number;
  activeTenantsToday: number;
  costThisMonthUsd: number;
  newTenantsToday: number;
}

interface HeatmapEntry {
  date: string;
  count: number;
}

function heatmapColor(count: number): string {
  if (count === 0) return 'bg-slate-100';
  if (count <= 5) return 'bg-indigo-200';
  if (count <= 20) return 'bg-indigo-400';
  return 'bg-indigo-600';
}

function formatCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay(); // 0=Sun, 1=Mon …
  if (day === 1) return 'Mon';
  if (day === 3) return 'Wed';
  if (day === 5) return 'Fri';
  return '';
}

interface MetricCardProps {
  label: string;
  value: string | number;
  alert?: boolean;
  sub?: string;
}

function MetricCard({ label, value, alert = false, sub }: MetricCardProps) {
  return (
    <div className={`bg-white rounded-xl border p-5 transition-colors ${
      alert ? 'border-red-200 bg-red-50' : 'border-slate-200'
    }`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${alert ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function MetricsPage() {
  const [realtime, setRealtime] = useState<RealtimeMetrics | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${session.access_token}` };

    const [realtimeRes, heatmapRes] = await Promise.all([
      fetch(`${API}/api/admin/metrics/realtime`, { headers }),
      fetch(`${API}/api/admin/metrics/heatmap`, { headers }),
    ]);

    let hasError = false;

    if (realtimeRes.ok) {
      setRealtime(await realtimeRes.json());
    } else {
      const body = await realtimeRes.json().catch(() => ({}));
      setError(body.error || 'Failed to load realtime metrics');
      hasError = true;
    }

    if (heatmapRes.ok) {
      const data = await heatmapRes.json();
      setHeatmap(data.heatmap ?? []);
    } else if (!hasError) {
      const body = await heatmapRes.json().catch(() => ({}));
      setError(body.error || 'Failed to load heatmap data');
    }

    if (!hasError) setError('');
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (live) {
      intervalRef.current = setInterval(() => { load(); }, 15_000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [live, load]);

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-500">
        <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
        Loading metrics…
      </div>
    );
  }

  const maxCount = heatmap.reduce((m, e) => Math.max(m, e.count), 0);

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Real-time Metrics</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <button
            onClick={() => setLive((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              live
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${live ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
            {live ? 'Live' : 'Paused'}
          </button>
          <button
            onClick={() => load()}
            className="text-xs font-medium text-rose-600 hover:text-rose-800 flex items-center gap-1.5 border border-rose-200 px-3 py-1.5 rounded-lg"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Metric cards */}
      {realtime && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
          <MetricCard
            label="Ops Last Hour"
            value={realtime.opsLastHour.toLocaleString()}
          />
          <MetricCard
            label="Failed Last Hour"
            value={realtime.failedLastHour.toLocaleString()}
            alert={realtime.failedLastHour > 0}
            sub={realtime.failedLastHour > 0 ? 'Needs attention' : 'All clear'}
          />
          <MetricCard
            label="Active Tenants Today"
            value={realtime.activeTenantsToday.toLocaleString()}
          />
          <MetricCard
            label="AI Cost This Month"
            value={formatCost(realtime.costThisMonthUsd)}
            sub="USD"
          />
          <MetricCard
            label="New Tenants Today"
            value={realtime.newTenantsToday.toLocaleString()}
          />
        </div>
      )}

      {/* 30-day Activity Heatmap */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">30-Day Activity Heatmap</h2>
            <p className="text-xs text-slate-400 mt-0.5">Daily operation counts</p>
          </div>
          <div className="text-xs text-slate-400">
            Max: {maxCount.toLocaleString()} ops/day
          </div>
        </div>

        {heatmap.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-400">No heatmap data available</p>
          </div>
        ) : (
          <>
            {/* Heatmap grid */}
            <div className="flex gap-1 flex-wrap items-end">
              {heatmap.map((entry) => (
                <div key={entry.date} className="flex flex-col items-center gap-0.5">
                  <div
                    className={`w-7 h-7 rounded-sm ${heatmapColor(entry.count)} transition-colors cursor-default`}
                    title={`${shortDate(entry.date)}: ${entry.count} ops`}
                  />
                  <span className="text-[9px] text-slate-400 leading-none h-3">
                    {dayLabel(entry.date)}
                  </span>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">Less</span>
              <div className="flex items-center gap-1">
                {[
                  { color: 'bg-slate-100', label: '0' },
                  { color: 'bg-indigo-200', label: '1–5' },
                  { color: 'bg-indigo-400', label: '6–20' },
                  { color: 'bg-indigo-600', label: '21+' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1" title={label}>
                    <div className={`w-4 h-4 rounded-sm ${color}`} />
                  </div>
                ))}
              </div>
              <span className="text-xs text-slate-400">More</span>
              <span className="text-xs text-slate-300 ml-1">|</span>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                {[
                  { color: 'bg-slate-100', label: '0' },
                  { color: 'bg-indigo-200', label: '1–5' },
                  { color: 'bg-indigo-400', label: '6–20' },
                  { color: 'bg-indigo-600', label: '21+' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1">
                    <div className={`w-3 h-3 rounded-sm ${color}`} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
