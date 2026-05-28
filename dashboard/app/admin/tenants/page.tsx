'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

import { API_URL as API, timedFetch } from '@/lib/api';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  created_at: string;
  usage: { ops: number; costUsd: number };
  connections: string[];
  subscription: { status: string } | null;
}

const PLAN_STYLES: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-700',
  growth: 'bg-indigo-100 text-indigo-700',
  agency: 'bg-purple-100 text-purple-700',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  onboarding: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filtered, setFiltered] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  const getToken = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  };

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await timedFetch(`${API}/api/admin/tenants`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTenants(data.tenants);
      setFiltered(data.tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bulkAction = async (status: string) => {
    if (!confirm(`Set ${selected.size} tenant(s) to "${status}"?`)) return;
    setBulkActing(true);
    const token = await getToken();
    await Promise.all([...selected].map((id) =>
      fetch(`${API}/api/admin/tenants/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    ));
    setBulkActing(false);
    setSelected(new Set());
    load();
  };

  const exportCSV = () => {
    const rows = [['Name', 'Plan', 'Status', 'Connections', 'Ops This Month', 'Cost USD', 'Created']];
    tenants.forEach((t: any) => rows.push([
      t.name, t.plan, t.status,
      t.connections?.join('; ') || '',
      t.usage?.ops ?? 0,
      t.usage?.costUsd ?? 0,
      new Date(t.created_at).toLocaleDateString(),
    ]));
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'tenants.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    let list = tenants;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((t) => t.name?.toLowerCase().includes(s) || t.slug?.toLowerCase().includes(s));
    }
    if (planFilter) list = list.filter((t) => t.plan === planFilter);
    if (statusFilter) list = list.filter((t) => t.status === statusFilter);
    setFiltered(list);
  }, [search, planFilter, statusFilter, tenants]);

  if (loading) return <div className="p-4 sm:p-8 text-sm text-slate-500">Loading…</div>;
  if (error) return <div className="p-4 sm:p-8 text-sm text-red-600">{error}</div>;

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tenants</h1>
          <p className="text-sm text-slate-500 mt-0.5">{tenants.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg">Export CSV</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Search name or slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-rose-200"
        />
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200"
        >
          <option value="">All plans</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="agency">Agency</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="suspended">Suspended</option>
        </select>
        {(search || planFilter || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setPlanFilter(''); setStatusFilter(''); }}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{filtered.length} shown</span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2 mb-3">
          <span className="text-sm font-medium text-rose-700">{selected.size} selected</span>
          <button onClick={() => bulkAction('suspended')} disabled={bulkActing} className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg font-medium disabled:opacity-40">
            {bulkActing ? '…' : 'Suspend All'}
          </button>
          <button onClick={() => bulkAction('active')} disabled={bulkActing} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg font-medium disabled:opacity-40">
            {bulkActing ? '…' : 'Activate All'}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:text-slate-700 ml-auto">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 font-medium w-8">
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={filtered.length > 0 && filtered.every((t) => selected.has(t.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected(new Set(filtered.map((t) => t.id)));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                />
              </th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">AI Ops</th>
              <th className="px-4 py-3 font-medium text-right">Cost</th>
              <th className="px-4 py-3 font-medium">Connections</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">No tenants found</td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={selected.has(t.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) { next.add(t.id); } else { next.delete(t.id); }
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/tenants/${t.id}`} className="font-medium text-slate-900 hover:text-rose-700">
                      {t.name || '—'}
                    </Link>
                    <p className="text-xs text-slate-400">{t.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_STYLES[t.plan] || 'bg-slate-100 text-slate-700'}`}>
                      {t.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[t.status] || 'bg-slate-100 text-slate-700'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 font-medium">{t.usage.ops.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-500 text-xs">${t.usage.costUsd.toFixed(3)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.connections.slice(0, 4).map((c) => (
                        <span key={c} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs capitalize">{c}</span>
                      ))}
                      {t.connections.length > 4 && (
                        <span className="text-xs text-slate-400">+{t.connections.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
