'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

import { API_URL as API, timedFetch } from '@/lib/api';

interface UsageData {
  period: string;
  totals: { ops: number; costUsd: number; images: number; imageCostUsd: number };
  byTenant: Array<{
    tenantId: string;
    tenantName: string;
    plan: string;
    ops: number;
    costUsd: number;
    images: number;
    imageCostUsd: number;
    topSkill: string | null;
    bySkill: Record<string, number>;
  }>;
  bySkill: Record<string, { ops: number; cost: number }>;
}

const PLAN_STYLES: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-600',
  growth: 'bg-indigo-100 text-indigo-700',
  agency: 'bg-purple-100 text-purple-700',
};

function getPeriods(): string[] {
  const periods: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(d.toISOString().slice(0, 7));
  }
  return periods;
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await timedFetch(`${API}/api/admin/usage?period=${period}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load usage');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [period]);

  const periods = getPeriods();
  const totalCost = data ? data.totals.costUsd + data.totals.imageCostUsd : 0;

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Usage Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">AI operations and image generation cost breakdown</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200"
        >
          {periods.map((p) => (
            <option key={p} value={p}>
              {new Date(p + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : !data ? null : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">AI Ops</p>
              <p className="text-3xl font-bold text-slate-900">{data.totals.ops.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Claude API calls</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">AI Cost</p>
              <p className="text-3xl font-bold text-slate-900">${data.totals.costUsd.toFixed(2)}</p>
              <p className="text-xs text-slate-400 mt-1">Anthropic API</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Images Generated</p>
              <p className="text-3xl font-bold text-slate-900">{data.totals.images.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">${data.totals.imageCostUsd.toFixed(2)} image cost</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Cost</p>
              <p className="text-3xl font-bold text-rose-600">${totalCost.toFixed(2)}</p>
              <p className="text-xs text-slate-400 mt-1">{data.byTenant.length} active tenant(s)</p>
            </div>
          </div>

          {/* Skill breakdown */}
          {Object.keys(data.bySkill).length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">AI Ops by Skill</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(data.bySkill).sort((a, b) => b[1].ops - a[1].ops).map(([skill, stats]) => (
                  <div key={skill} className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 truncate">{skill}</p>
                    <p className="text-lg font-bold text-slate-800 mt-0.5">{stats.ops.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">${stats.cost.toFixed(3)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-tenant table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Usage by Tenant</h2>
            </div>
            {!data.byTenant.length ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No usage data for this period</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium">Tenant</th>
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-5 py-3 font-medium text-right">AI Ops</th>
                    <th className="px-5 py-3 font-medium text-right">AI Cost</th>
                    <th className="px-5 py-3 font-medium text-right">Images</th>
                    <th className="px-5 py-3 font-medium text-right">Image Cost</th>
                    <th className="px-5 py-3 font-medium">Top Skill</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byTenant.map((t) => {
                    const isExpanded = expandedTenant === t.tenantId;
                    return (
                      <React.Fragment key={t.tenantId}>
                        <tr
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => setExpandedTenant(isExpanded ? null : t.tenantId)}
                        >
                          <td className="px-5 py-3">
                            <span className="font-medium text-slate-900">{t.tenantName}</span>
                            <p className="text-xs text-slate-400 font-mono">{t.tenantId.slice(0, 8)}</p>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_STYLES[t.plan] || 'bg-slate-100 text-slate-600'}`}>
                              {t.plan}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-bold text-slate-900">{t.ops.toLocaleString()}</td>
                          <td className="px-5 py-3 text-right text-slate-600">${t.costUsd.toFixed(4)}</td>
                          <td className="px-5 py-3 text-right font-bold text-slate-900">
                            {t.images > 0 ? t.images.toLocaleString() : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right text-slate-600">
                            {t.images > 0 ? `$${t.imageCostUsd.toFixed(4)}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-slate-500 capitalize">{t.topSkill || '—'}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-5 py-3 bg-slate-50">
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(t.bySkill).sort((a, b) => b[1] - a[1]).map(([skill, count]) => (
                                  <div key={skill} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                                    <span className="text-xs text-slate-500">{skill}</span>
                                    <span className="text-xs font-bold text-slate-800">{count}</span>
                                  </div>
                                ))}
                                {t.images > 0 && (
                                  <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                                    <span className="text-xs text-indigo-500">visual-designer</span>
                                    <span className="text-xs font-bold text-indigo-800">{t.images} img</span>
                                    <span className="text-xs text-indigo-400">${t.imageCostUsd.toFixed(3)}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
