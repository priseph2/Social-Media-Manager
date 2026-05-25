'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface BillingSummary {
  mrrUsd: number;
  arrUsd: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  byPlan: Record<string, {
    total: number; active: number; cancelled: number;
    trialing: number; revenue: number; priceUsd: number;
  }>;
  recentEvents: Array<{
    event_type: string; payload: any; created_at: string;
    tenant_id: string; tenantName: string;
  }>;
}

const PLAN_META: Record<string, { label: string; bar: string; badge: string }> = {
  free:    { label: 'Free',    bar: 'bg-slate-300',   badge: 'bg-slate-100 text-slate-600' },
  starter: { label: 'Starter', bar: 'bg-sky-400',     badge: 'bg-sky-100 text-sky-700' },
  growth:  { label: 'Growth',  bar: 'bg-indigo-500',  badge: 'bg-indigo-100 text-indigo-700' },
  agency:  { label: 'Agency',  bar: 'bg-violet-600',  badge: 'bg-violet-100 text-violet-700' },
};

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  subscription_created:   { label: 'New subscription',    color: 'text-emerald-700 bg-emerald-50' },
  subscription_renewed:   { label: 'Renewal',             color: 'text-emerald-700 bg-emerald-50' },
  subscription_cancelled: { label: 'Cancellation',        color: 'text-red-700 bg-red-50' },
  plan_changed:           { label: 'Plan changed',        color: 'text-indigo-700 bg-indigo-50' },
  payment_failed:         { label: 'Payment failed',      color: 'text-red-700 bg-red-50' },
  trial_started:          { label: 'Trial started',       color: 'text-amber-700 bg-amber-50' },
  trial_ended:            { label: 'Trial ended',         color: 'text-slate-700 bg-slate-100' },
};

function MetricCard({ label, value, sub, highlight = false }: {
  label: string; value: string | number; sub?: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${highlight ? 'bg-rose-600 border-rose-500' : 'bg-white border-slate-200'}`}>
      <p className={`text-xs uppercase tracking-wide font-medium mb-1 ${highlight ? 'text-rose-200' : 'text-slate-500'}`}>{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${highlight ? 'text-rose-200' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  );
}

export default function BillingPage() {
  const [data, setData] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    const res = await fetch(`${API}/api/admin/billing/summary`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setData(await res.json());
    else setError('Failed to load billing data');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-500">
      <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
      Loading billing data…
    </div>
  );

  if (error || !data) return (
    <div className="p-8 text-red-600 text-sm bg-red-50 rounded-xl border border-red-200 mx-8">{error || 'No data'}</div>
  );

  const maxRevenue = Math.max(...Object.values(data.byPlan).map((p) => p.revenue), 1);

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Billing & Revenue</h1>
          <p className="text-sm text-slate-500 mt-0.5">Based on active subscriptions in Supabase</p>
        </div>
        <button
          onClick={load}
          className="text-xs font-medium text-rose-600 hover:text-rose-800 flex items-center gap-1.5 border border-rose-200 px-3 py-1.5 rounded-lg"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Monthly Recurring Revenue" value={`$${data.mrrUsd.toLocaleString()}`} sub="USD · active paid plans" highlight />
        <MetricCard label="Annual Run Rate" value={`$${data.arrUsd.toLocaleString()}`} sub={`MRR × 12`} />
        <MetricCard label="Active Subscriptions" value={data.activeSubscriptions} sub={`of ${data.totalSubscriptions} total`} />
        <MetricCard label="Free Users" value={data.byPlan.free?.total ?? 0} sub="no payment required" />
      </div>

      {/* Plan breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-5">Revenue by Plan</h2>
          <div className="space-y-4">
            {(['agency', 'growth', 'starter', 'free'] as const).map((plan) => {
              const p = data.byPlan[plan];
              if (!p) return null;
              const meta = PLAN_META[plan];
              const pct = Math.round((p.revenue / maxRevenue) * 100);
              return (
                <div key={plan}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-slate-400">
                        {p.active} active · {p.cancelled} cancelled
                        {p.trialing > 0 ? ` · ${p.trialing} trialing` : ''}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-900">
                      {p.revenue > 0 ? `$${p.revenue.toLocaleString()}/mo` : '—'}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${meta.bar}`} style={{ width: `${pct || 2}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Plan detail table */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Subscription Breakdown</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-medium">Plan</th>
                <th className="pb-2 font-medium text-right">Price</th>
                <th className="pb-2 font-medium text-right">Active</th>
                <th className="pb-2 font-medium text-right">Total</th>
                <th className="pb-2 font-medium text-right">MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(['agency', 'growth', 'starter', 'free'] as const).map((plan) => {
                const p = data.byPlan[plan];
                if (!p) return null;
                const meta = PLAN_META[plan];
                return (
                  <tr key={plan} className="hover:bg-slate-50">
                    <td className="py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {p.priceUsd > 0 ? `$${p.priceUsd}` : 'Free'}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-slate-900">{p.active}</td>
                    <td className="py-2.5 text-right text-slate-500">{p.total}</td>
                    <td className="py-2.5 text-right font-bold text-slate-900">
                      {p.revenue > 0 ? `$${p.revenue}` : '—'}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-slate-200 font-semibold">
                <td className="pt-2.5 text-slate-900">Total</td>
                <td />
                <td className="pt-2.5 text-right text-slate-900">{data.activeSubscriptions}</td>
                <td className="pt-2.5 text-right text-slate-500">{data.totalSubscriptions}</td>
                <td className="pt-2.5 text-right text-rose-700">${data.mrrUsd.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent billing events */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Recent Billing Events</h2>
          <span className="text-xs text-slate-400">Last 30 events · from billing_events table</span>
        </div>
        {!data.recentEvents.length ? (
          <div className="text-center py-8">
            <p className="text-slate-400 text-sm">No billing events recorded yet.</p>
            <p className="text-slate-400 text-xs mt-1">Events are created when Paystack webhooks fire.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">Event</th>
                  <th className="pb-2 font-medium">Tenant</th>
                  <th className="pb-2 font-medium">Details</th>
                  <th className="pb-2 font-medium text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.recentEvents.map((e, i) => {
                  const meta = EVENT_LABELS[e.event_type] || { label: e.event_type, color: 'text-slate-600 bg-slate-100' };
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {e.tenant_id ? (
                          <Link href={`/admin/tenants/${e.tenant_id}`} className="text-indigo-600 hover:text-indigo-800 text-sm">
                            {e.tenantName}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 text-slate-500 text-xs">
                        {e.payload?.plan ? `Plan: ${e.payload.plan}` : ''}
                        {e.payload?.amount ? ` · ₦${Number(e.payload.amount).toLocaleString()}` : ''}
                      </td>
                      <td className="py-2.5 text-slate-400 text-xs text-right">
                        {new Date(e.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Revenue figures are estimates based on active subscription plans. Verify against Paystack dashboard for authoritative numbers.
      </p>
    </div>
  );
}
