'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const IMAGE_PROVIDERS = [
  { value: 'imagen4-fast',     label: 'Imagen 4 Fast ($0.02/img)' },
  { value: 'imagen4-standard', label: 'Imagen 4 Standard ($0.04/img)' },
  { value: 'dalle3-standard',  label: 'DALL-E 3 Standard ($0.04/img)' },
  { value: 'dalle3-hd',        label: 'DALL-E 3 HD ($0.08/img)' },
  { value: 'canva',            label: 'Canva (tenant credentials)' },
];

interface TenantDetail {
  tenant: {
    id: string; name: string; slug: string; plan: string; status: string;
    image_provider: string; created_at: string; updated_at: string;
  };
  subscription: { plan: string; status: string; current_period_end: string } | null;
  connections: Array<{ platform: string; status: string; connected_at: string }>;
  onboarding: Array<{ step: string; completed: boolean; completed_at: string }>;
  usageByPeriod: Record<string, { ops: number; costUsd: number }>;
  usageThisMonth: { ops: number; costUsd: number };
  recentEscalations: Array<{ id: string; type: string; reason: string; created_at: string; resolved: boolean }>;
  recentActivity: Array<{ id: string; skill: string; action: string; status: string; duration_ms: number; completed_at: string }>;
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

const TABS = ['Overview', 'Connections', 'Onboarding', 'Escalations', 'Activity'];

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('Overview');
  const [token, setToken] = useState('');

  // Edit controls
  const [editPlan, setEditPlan] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editImageProvider, setEditImageProvider] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        setToken(session.access_token);
        const res = await fetch(`${API}/api/admin/tenants/${id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const d = await res.json();
        setData(d);
        setEditPlan(d.tenant.plan);
        setEditStatus(d.tenant.status);
        setEditImageProvider(d.tenant.image_provider || 'imagen4-fast');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tenant');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`${API}/api/admin/tenants/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: editPlan, status: editStatus, image_provider: editImageProvider }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveMsg('Saved');
      setData((prev) => prev ? { ...prev, tenant: { ...prev.tenant, plan: editPlan, status: editStatus, image_provider: editImageProvider } } : prev);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const { tenant, subscription, connections, onboarding, usageByPeriod, usageThisMonth, recentEscalations, recentActivity } = data;

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
        <Link href="/admin" className="hover:text-rose-600">Admin</Link>
        <span>/</span>
        <Link href="/admin/tenants" className="hover:text-rose-600">Tenants</Link>
        <span>/</span>
        <span className="text-slate-700">{tenant.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{tenant.name || 'Unnamed'}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{tenant.slug} · {tenant.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${PLAN_STYLES[tenant.plan] || ''}`}>{tenant.plan}</span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[tenant.status] || ''}`}>{tenant.status}</span>
        </div>
      </div>

      {/* Admin Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Admin Controls</h2>
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Plan</label>
            <select
              value={editPlan}
              onChange={(e) => setEditPlan(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200"
            >
              <option value="starter">Starter ($49)</option>
              <option value="growth">Growth ($149)</option>
              <option value="agency">Agency ($399)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200"
            >
              <option value="active">Active</option>
              <option value="onboarding">Onboarding</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Image Generator</label>
            <select
              value={editImageProvider}
              onChange={(e) => setEditImageProvider(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200"
            >
              {IMAGE_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || (editPlan === tenant.plan && editStatus === tenant.status && editImageProvider === (tenant.image_provider || 'imagen4-fast'))}
            className="px-4 py-1.5 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saveMsg && <span className="text-xs text-emerald-600">{saveMsg}</span>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">AI Ops (this month)</p>
          <p className="text-2xl font-bold text-slate-900">{usageThisMonth.ops.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-0.5">${usageThisMonth.costUsd.toFixed(4)} cost</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Connected Platforms</p>
          <p className="text-2xl font-bold text-slate-900">{connections.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Subscription</p>
          <p className="text-lg font-bold text-slate-900 capitalize">{subscription?.status || 'None'}</p>
          {subscription?.current_period_end && (
            <p className="text-xs text-slate-400 mt-0.5">Until {new Date(subscription.current_period_end).toLocaleDateString()}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-rose-600 text-rose-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Usage History</h3>
          {!Object.keys(usageByPeriod).length ? (
            <p className="text-sm text-slate-400">No usage data</p>
          ) : (
            <table className="w-full text-sm bg-white rounded-xl border border-slate-200 overflow-hidden">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium text-right">AI Ops</th>
                  <th className="px-4 py-3 font-medium text-right">Cost (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(usageByPeriod).sort((a, b) => b[0].localeCompare(a[0])).map(([period, u]) => (
                  <tr key={period} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-700">{period}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{u.ops.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">${u.costUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Connections' && (
        <div className="grid grid-cols-2 gap-3">
          {!connections.length ? (
            <p className="text-sm text-slate-400">No connected platforms</p>
          ) : (
            connections.map((c) => (
              <div key={c.platform} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800 capitalize">{c.platform}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${c.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Connected {new Date(c.connected_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'Onboarding' && (
        <div className="space-y-2">
          {!onboarding.length ? (
            <p className="text-sm text-slate-400">No onboarding data</p>
          ) : (
            onboarding.map((step) => (
              <div key={step.step} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${step.completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {step.completed ? '✓' : '○'}
                </span>
                <span className="text-sm font-medium text-slate-700 capitalize">{step.step.replace(/_/g, ' ')}</span>
                {step.completed_at && (
                  <span className="ml-auto text-xs text-slate-400">
                    {new Date(step.completed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'Escalations' && (
        <div className="space-y-2">
          {!recentEscalations.length ? (
            <p className="text-sm text-slate-400">No escalations</p>
          ) : (
            recentEscalations.map((e) => (
              <div key={e.id} className={`bg-white rounded-xl border p-4 ${e.resolved ? 'border-slate-200' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-sm font-medium text-slate-800 capitalize">{String(e.type).replace(/_/g, ' ')}</span>
                    <p className="text-xs text-slate-500 mt-0.5">{e.reason}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${e.resolved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {e.resolved ? 'Resolved' : 'Open'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-2">{new Date(e.created_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'Activity' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Skill</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Duration</th>
                <th className="px-4 py-3 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!recentActivity.length ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No activity</td></tr>
              ) : (
                recentActivity.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{t.skill}</td>
                    <td className="px-4 py-2.5 text-slate-500">{t.action}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${
                        t.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        t.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                      }`}>{t.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-400">{t.duration_ms ? `${t.duration_ms}ms` : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                      {t.completed_at ? new Date(t.completed_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
