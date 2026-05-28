'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

import { API_URL as API, timedFetch } from '@/lib/api';

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:    { label: 'Free',    color: 'bg-slate-100 text-slate-600' },
  starter: { label: 'Starter', color: 'bg-sky-100 text-sky-700' },
  growth:  { label: 'Growth',  color: 'bg-indigo-100 text-indigo-700' },
  agency:  { label: 'Agency',  color: 'bg-violet-100 text-violet-700' },
};

const STATUS_COLORS: Record<string, string> = {
  active:     'bg-emerald-100 text-emerald-700',
  onboarding: 'bg-amber-100 text-amber-700',
  suspended:  'bg-red-100 text-red-700',
};

const TASK_DOT: Record<string, string> = {
  completed: 'bg-emerald-500',
  failed:    'bg-red-500',
  running:   'bg-amber-400',
  escalated: 'bg-orange-500',
};

const SERVICE_LABELS: Record<string, string> = {
  anthropic: 'Anthropic AI', redis: 'Redis / Upstash', supabase: 'Supabase',
  mongodb: 'MongoDB', buffer: 'Buffer', mailchimp: 'Mailchimp', paystack: 'Paystack',
};

function StatCard({
  label, value, sub, href, alert = false,
}: {
  label: string; value: string | number; sub?: string; href?: string; alert?: boolean;
}) {
  const inner = (
    <div className={`bg-white rounded-xl border p-5 h-full transition-colors ${alert ? 'border-red-200 bg-red-50' : 'border-slate-200 hover:border-rose-200'}`}>
      <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${alert ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [failedJobs, setFailedJobs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const headers = { Authorization: `Bearer ${session.access_token}` };

    const [overviewRes, jobsRes] = await Promise.all([
      fetch(`${API}/api/admin/overview`, { headers }),
      fetch(`${API}/api/admin/overview/jobs-count`, { headers }),
    ]);

    if (overviewRes.ok) setData(await overviewRes.json());
    if (jobsRes.ok) setFailedJobs((await jobsRes.json()).failedJobs ?? 0);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-500">
      <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
      Loading system overview…
    </div>
  );

  if (!data) return <div className="p-8 text-red-600 text-sm">Failed to load overview data.</div>;

  const totalPlanTenants = Object.values(data.tenants.byPlan as Record<string, number>).reduce((a, b) => a + b, 0) || 1;
  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const allServicesOk = Object.values(data.services as Record<string, boolean>).every(Boolean);
  const healthLevel = failedJobs > 0 ? 'warn' : !allServicesOk ? 'warn' : 'ok';

  return (
    <div className="p-4 sm:p-8 max-w-7xl">

      {/* ── Status banner ── */}
      <div className={`flex items-center justify-between rounded-xl px-5 py-3 mb-6 border ${
        healthLevel === 'ok'
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${healthLevel === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className={`text-sm font-semibold ${healthLevel === 'ok' ? 'text-emerald-800' : 'text-amber-800'}`}>
            {healthLevel === 'ok' ? 'All systems operational' : `${failedJobs > 0 ? `${failedJobs} failed job${failedJobs > 1 ? 's' : ''}` : 'Some services need attention'}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : ''}
          </span>
          <button
            onClick={() => { setLoading(false); load(); }}
            className="text-xs font-medium text-rose-600 hover:text-rose-800 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">System Overview</h1>
          <p className="text-sm text-slate-500">{month}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/tenants" className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
            + Manage Tenants
          </Link>
          <Link href="/admin/config" className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-colors">
            Configuration →
          </Link>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total Tenants" value={data.tenants.total} href="/admin/tenants" />
        <StatCard label="Active Tenants" value={data.tenants.byStatus?.active ?? 0} sub="paying / onboarded" href="/admin/tenants" />
        <StatCard label="Est. MRR" value={`$${data.billing.mrrUsd.toLocaleString()}`} sub="USD / active subs" href="/admin/billing" />
        <StatCard label="AI Ops This Month" value={data.usage.opsThisMonth.toLocaleString()} sub={`$${data.usage.costThisMonthUsd.toFixed(2)} cost`} href="/admin/usage" />
        <StatCard label="Failed Jobs" value={failedJobs} sub="across all queues" href="/admin/jobs" alert={failedJobs > 0} />
        <StatCard label="Open Escalations" value={data.openEscalations} sub="requiring attention" alert={data.openEscalations > 0} />
      </div>

      {/* ── Middle row: Plan distribution + Service health ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

        {/* Plan distribution */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Tenant Plan Distribution</h2>
            <Link href="/admin/billing" className="text-xs text-rose-600 hover:text-rose-800">Billing →</Link>
          </div>
          <div className="space-y-3">
            {(['free', 'starter', 'growth', 'agency'] as const).map((plan) => {
              const count = (data.tenants.byPlan as Record<string, number>)[plan] ?? 0;
              const pct = Math.round((count / totalPlanTenants) * 100);
              const cfg = PLAN_LABELS[plan];
              return (
                <div key={plan} className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-16 text-center ${cfg.color}`}>
                    {cfg.label}
                  </span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        plan === 'agency' ? 'bg-violet-500' : plan === 'growth' ? 'bg-indigo-500' : plan === 'starter' ? 'bg-sky-400' : 'bg-slate-300'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-900 w-6 text-right">{count}</span>
                  <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex gap-4 flex-wrap">
            {Object.entries(data.tenants.byStatus as Record<string, number>).map(([status, count]) => (
              <div key={status} className="flex items-center gap-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-600'}`}>
                  {status}
                </span>
                <span className="text-sm font-bold text-slate-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Service health */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Service Config</h2>
            <Link href="/admin/services" className="text-xs text-rose-600 hover:text-rose-800">Health check →</Link>
          </div>
          <div className="space-y-2.5">
            {Object.entries(data.services as Record<string, boolean>).map(([key, ok]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-slate-700">{SERVICE_LABELS[key] || key}</span>
                <span className={`flex items-center gap-1.5 text-xs font-medium ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  {ok ? 'Configured' : 'Missing'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'View All Tenants', href: '/admin/tenants', icon: '🏢' },
          { label: 'Check Service Health', href: '/admin/services', icon: '🩺' },
          { label: 'Clear Failed Jobs', href: '/admin/jobs', icon: '🧹' },
          { label: 'Edit Configuration', href: '/admin/config', icon: '⚙️' },
        ].map(({ label, href, icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 bg-white border border-slate-200 hover:border-rose-200 hover:bg-rose-50 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 hover:text-rose-700 transition-all"
          >
            <span>{icon}</span>
            {label}
          </Link>
        ))}
      </div>

      {/* ── Recent activity ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Recent Activity</h2>
          <Link href="/admin/jobs" className="text-xs text-rose-600 hover:text-rose-800">Job queues →</Link>
        </div>
        {!data.recentActivity?.length ? (
          <p className="text-sm text-slate-400 py-4 text-center">No activity yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium w-6" />
                  <th className="pb-2 font-medium">Skill</th>
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Tenant</th>
                  <th className="pb-2 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.recentActivity.map((t: any) => (
                  <tr key={t.id} className="hover:bg-slate-50 group">
                    <td className="py-2">
                      <span className={`block w-1.5 h-1.5 rounded-full ${TASK_DOT[t.status] || 'bg-slate-400'}`} />
                    </td>
                    <td className="py-2 font-medium text-slate-800">{t.skill}</td>
                    <td className="py-2 text-slate-500 truncate max-w-[200px]">{t.action}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        t.status === 'failed' ? 'bg-red-50 text-red-700' :
                        t.status === 'escalated' ? 'bg-orange-50 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{t.status}</span>
                    </td>
                    <td className="py-2 text-slate-500 text-xs">{t.tenantName}</td>
                    <td className="py-2 text-slate-400 text-xs text-right">
                      {t.completed_at ? new Date(t.completed_at).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
