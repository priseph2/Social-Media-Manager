'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface OverviewData {
  tenants: {
    total: number;
    byStatus: Record<string, number>;
    byPlan: Record<string, number>;
  };
  billing: { mrrUsd: number };
  usage: { opsThisMonth: number; costThisMonthUsd: number };
  openEscalations: number;
  recentActivity: Array<{
    id: string;
    skill: string;
    action: string;
    status: string;
    tenant_id: string;
    tenantName: string;
    completed_at: string;
  }>;
  services: Record<string, boolean>;
}

const SERVICE_LABELS: Record<string, string> = {
  anthropic: 'Anthropic', redis: 'Redis', supabase: 'Supabase',
  mongodb: 'MongoDB', buffer: 'Buffer', mailchimp: 'Mailchimp', paystack: 'Paystack',
};

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-slate-100 text-slate-700',
  growth: 'bg-indigo-100 text-indigo-700',
  agency: 'bg-purple-100 text-purple-700',
};

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-emerald-500',
  failed: 'bg-red-500',
  running: 'bg-amber-400',
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`${API}/api/admin/overview`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load overview');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="p-4 sm:p-8 text-sm text-slate-500">Loading…</div>;
  if (error) return <div className="p-4 sm:p-8 text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">System Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">{month}</p>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Tenants" value={data.tenants.total} sub={`${data.tenants.byStatus.active ?? 0} active`} />
        <StatCard label="Est. MRR" value={`$${data.billing.mrrUsd.toLocaleString()}`} sub="USD" />
        <StatCard label="AI Ops This Month" value={data.usage.opsThisMonth.toLocaleString()} sub={`$${data.usage.costThisMonthUsd.toFixed(2)} cost`} />
        <StatCard label="Open Escalations" value={data.openEscalations} />
      </div>

      {/* Plan distribution */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Tenant Plan Distribution</h2>
        <div className="flex items-center gap-4">
          {Object.entries(data.tenants.byPlan).map(([plan, count]) => (
            <div key={plan} className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[plan] || 'bg-slate-100 text-slate-700'}`}>{plan}</span>
              <span className="text-lg font-bold text-slate-900">{count}</span>
            </div>
          ))}
          {Object.entries(data.tenants.byStatus).filter(([s]) => s !== 'active').map(([status, count]) => (
            <div key={status} className="flex items-center gap-1.5 ml-4 text-sm text-slate-500">
              <span className="capitalize">{status}:</span>
              <span className="font-medium text-slate-700">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Services */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Service Configuration</h2>
          <Link href="/admin/services" className="text-xs text-rose-600 hover:text-rose-800">Live health check →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(data.services).map(([key, configured]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${configured ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="text-sm text-slate-700">{SERVICE_LABELS[key] || key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Recent Activity</h2>
          <Link href="/admin/jobs" className="text-xs text-rose-600 hover:text-rose-800">Job queues →</Link>
        </div>
        {!data.recentActivity.length ? (
          <p className="text-sm text-slate-400">No activity yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-medium">Skill</th>
                <th className="pb-2 font-medium">Action</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Tenant</th>
                <th className="pb-2 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.recentActivity.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="py-2 text-slate-700 font-medium">{t.skill}</td>
                  <td className="py-2 text-slate-500">{t.action}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[t.status] || 'bg-slate-400'}`} />
                      <span className="text-slate-600 capitalize">{t.status}</span>
                    </span>
                  </td>
                  <td className="py-2 text-slate-500 text-xs">{t.tenantName}</td>
                  <td className="py-2 text-slate-400 text-xs text-right">
                    {t.completed_at ? new Date(t.completed_at).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
