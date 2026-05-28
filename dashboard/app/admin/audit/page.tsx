'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

import { API_URL as API, timedFetch } from '@/lib/api';

const ENTITY_TYPES = ['all', 'tenant', 'user', 'content_approval', 'ip_blocklist', 'config'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

interface AuditEntry {
  id: string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 50;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function actionColor(action: string): string {
  const a = action.toLowerCase();
  if (/approve|add|grant/.test(a)) return 'bg-emerald-100 text-emerald-700';
  if (/ban|block|reject|suspend/.test(a)) return 'bg-red-100 text-red-700';
  if (/impersonate/.test(a)) return 'bg-indigo-100 text-indigo-700';
  if (/config|update/.test(a)) return 'bg-amber-100 text-amber-700';
  if (/remove|revoke/.test(a)) return 'bg-orange-100 text-orange-700';
  return 'bg-slate-100 text-slate-600';
}

function avatarInitials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function avatarColor(email: string): string {
  const colors = [
    'bg-rose-100 text-rose-700',
    'bg-violet-100 text-violet-700',
    'bg-sky-100 text-sky-700',
    'bg-teal-100 text-teal-700',
    'bg-amber-100 text-amber-700',
    'bg-indigo-100 text-indigo-700',
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) & 0xffff;
  return colors[hash % colors.length];
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState<EntityType>('all');
  const [page, setPage] = useState(0);
  const [live, setLive] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${session.access_token}` };

    const res = await timedFetch(`${API}/api/admin/audit`, { headers });
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
      setError('');
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to load audit log');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (live) {
      intervalRef.current = setInterval(() => { load(); }, 30_000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [live, load]);

  // Client-side filtering
  const filtered = entries.filter((e) => {
    const matchSearch = !search || e.action.toLowerCase().includes(search.toLowerCase());
    const matchEntity = entityFilter === 'all' || e.entity_type === entityFilter;
    return matchSearch && matchEntity;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page on filter change
  const handleSearch = (v: string) => { setSearch(v); setPage(0); };
  const handleEntityFilter = (v: EntityType) => { setEntityFilter(v); setPage(0); };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-500">
        <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
        Loading audit log…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} total entries</p>
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
            <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filter by action text…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => handleEntityFilter(e.target.value as EntityType)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none bg-white"
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All entity types' : t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {paged.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">No audit entries found</p>
            <p className="text-xs text-slate-400 mt-1">
              {search || entityFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Admin actions will appear here as they happen'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Admin</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity Type</th>
                  <th className="px-4 py-3 font-medium">Entity ID</th>
                  <th className="px-4 py-3 font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paged.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 group">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="text-slate-700 text-xs font-medium cursor-default"
                        title={new Date(entry.created_at).toLocaleString()}
                      >
                        {timeAgo(entry.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(entry.admin_email)}`}>
                          {avatarInitials(entry.admin_email)}
                        </div>
                        <span className="text-slate-700 text-xs truncate max-w-[160px]" title={entry.admin_email}>
                          {entry.admin_email}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColor(entry.action)}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                        {entry.entity_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-mono text-slate-500 truncate block max-w-[120px]"
                        title={entry.entity_id}
                      >
                        {entry.entity_id.length > 12
                          ? `${entry.entity_id.slice(0, 8)}…`
                          : entry.entity_id}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.metadata ? (
                        <span
                          className="text-xs font-mono text-slate-400 truncate block max-w-[200px]"
                          title={JSON.stringify(entry.metadata, null, 2)}
                        >
                          {JSON.stringify(entry.metadata).slice(0, 40)}
                          {JSON.stringify(entry.metadata).length > 40 ? '…' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-400">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} filtered entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-xs font-medium px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:border-rose-200 hover:text-rose-600 transition-colors"
            >
              Prev
            </button>
            <span className="text-xs text-slate-500">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-xs font-medium px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:border-rose-200 hover:text-rose-600 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      {totalPages <= 1 && filtered.length > 0 && (
        <p className="text-xs text-slate-400 mt-3 text-right">
          Showing {filtered.length} entries
        </p>
      )}
    </div>
  );
}
