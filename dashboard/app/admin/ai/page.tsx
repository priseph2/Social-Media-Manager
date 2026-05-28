'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

import { API_URL as API, timedFetch } from '@/lib/api';

interface SkillBreakdown {
  skill: string;
  ops: number;
  costUsd: number;
}

interface TenantAICost {
  tenantId: string;
  tenantName: string;
  plan: string;
  ops: number;
  costUsd: number;
  bySkill: SkillBreakdown[];
}

interface AICostsData {
  tenants: TenantAICost[];
  period: string;
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-slate-100 text-slate-600',
  starter: 'bg-sky-100 text-sky-700',
  growth: 'bg-indigo-100 text-indigo-700',
  agency: 'bg-violet-100 text-violet-700',
};

function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function AICostsPage() {
  const [data, setData] = useState<AICostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await timedFetch(`${API}/api/admin/ai/costs`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI costs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleExpand = (tenantId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) {
        next.delete(tenantId);
      } else {
        next.add(tenantId);
      }
      return next;
    });
  };

  const totalCost = data ? data.tenants.reduce((sum, t) => sum + t.costUsd, 0) : 0;
  const totalOps = data ? data.tenants.reduce((sum, t) => sum + t.ops, 0) : 0;
  const tenantCount = data ? data.tenants.length : 0;
  const avgCost = tenantCount > 0 ? totalCost / tenantCount : 0;
  const maxCost = data ? Math.max(...data.tenants.map((t) => t.costUsd), 0) : 0;

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">AI Usage &amp; Costs</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {data ? `Cost breakdown by tenant — ${formatPeriod(data.period)}` : 'Loading period…'}
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : !data ? null : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total AI Spend</p>
              <p className="text-3xl font-bold text-rose-600">${totalCost.toFixed(4)}</p>
              <p className="text-xs text-slate-400 mt-1">{formatPeriod(data.period)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Operations</p>
              <p className="text-3xl font-bold text-slate-900">{totalOps.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">API calls made</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Tenants Using AI</p>
              <p className="text-3xl font-bold text-slate-900">{tenantCount}</p>
              <p className="text-xs text-slate-400 mt-1">active this period</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Avg Cost/Tenant</p>
              <p className="text-3xl font-bold text-slate-900">${avgCost.toFixed(4)}</p>
              <p className="text-xs text-slate-400 mt-1">mean per tenant</p>
            </div>
          </div>

          {/* Main table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">AI Costs by Tenant</h2>
            </div>
            {!data.tenants.length ? (
              <div className="px-5 py-12 text-center text-sm text-slate-400">
                No AI usage recorded this month.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-5 py-3 font-medium w-10">#</th>
                    <th className="px-5 py-3 font-medium">Tenant</th>
                    <th className="px-5 py-3 font-medium">Plan</th>
                    <th className="px-5 py-3 font-medium text-right">Ops</th>
                    <th className="px-5 py-3 font-medium text-right">Cost</th>
                    <th className="px-5 py-3 font-medium">Distribution</th>
                    <th className="px-3 py-3 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.tenants
                    .slice()
                    .sort((a, b) => b.costUsd - a.costUsd)
                    .map((tenant, idx) => {
                      const isExpanded = expanded.has(tenant.tenantId);
                      const barWidth = maxCost > 0 ? (tenant.costUsd / maxCost) * 100 : 0;
                      return (
                        <>
                          <tr
                            key={tenant.tenantId}
                            className="hover:bg-slate-50 cursor-pointer"
                            onClick={() => toggleExpand(tenant.tenantId)}
                          >
                            <td className="px-5 py-3 text-slate-400 font-mono text-xs">{idx + 1}</td>
                            <td className="px-5 py-3">
                              <Link
                                href={`/admin/tenants/${tenant.tenantId}`}
                                className="font-medium text-slate-900 hover:text-rose-600 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {tenant.tenantName}
                              </Link>
                              <p className="text-xs text-slate-400 font-mono">{tenant.tenantId.slice(0, 8)}</p>
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                                  PLAN_COLORS[tenant.plan] || 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {tenant.plan}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-bold text-slate-900">
                              {tenant.ops.toLocaleString()}
                            </td>
                            <td className="px-5 py-3 text-right text-slate-700 font-mono">
                              ${tenant.costUsd.toFixed(4)}
                            </td>
                            <td className="px-5 py-3">
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-2 bg-rose-400 rounded-full"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-400">
                              <svg
                                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${tenant.tenantId}-expanded`}>
                              <td colSpan={7} className="px-5 py-4 bg-slate-50">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                                  Skill Breakdown
                                </p>
                                {!tenant.bySkill.length ? (
                                  <p className="text-xs text-slate-400">No skill data available.</p>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-slate-400 uppercase tracking-wide">
                                        <th className="pb-1.5 font-medium pr-4">Skill</th>
                                        <th className="pb-1.5 font-medium text-right pr-4">Ops</th>
                                        <th className="pb-1.5 font-medium text-right pr-4">Cost</th>
                                        <th className="pb-1.5 font-medium text-right">% of Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {tenant.bySkill
                                        .slice()
                                        .sort((a, b) => b.costUsd - a.costUsd)
                                        .map((s) => (
                                          <tr key={s.skill}>
                                            <td className="py-1.5 pr-4 text-slate-700 capitalize">{s.skill}</td>
                                            <td className="py-1.5 pr-4 text-right text-slate-600">
                                              {s.ops.toLocaleString()}
                                            </td>
                                            <td className="py-1.5 pr-4 text-right font-mono text-slate-600">
                                              ${s.costUsd.toFixed(4)}
                                            </td>
                                            <td className="py-1.5 text-right text-slate-500">
                                              {tenant.costUsd > 0
                                                ? ((s.costUsd / tenant.costUsd) * 100).toFixed(1)
                                                : '0.0'}
                                              %
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
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
