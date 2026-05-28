'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

import { API_URL as API } from '@/lib/api';

type Tab = 'rate_limits' | 'moderation' | 'ai_models' | 'maintenance';

interface ConfigEntry { value: any; updated_at?: string; updated_by?: string }
interface ConfigData {
  config: Record<string, ConfigEntry>;
  defaults: {
    rateLimits: Record<string, number>;
    brand: Record<string, number>;
    models: Record<string, string>;
  };
}

function SavedBadge({ entry }: { entry?: ConfigEntry }) {
  if (!entry?.updated_at) return null;
  return (
    <span className="text-xs text-slate-400">
      Saved {new Date(entry.updated_at).toLocaleDateString()} by {entry.updated_by}
    </span>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
        <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function ConfigPage() {
  const [tab, setTab] = useState<Tab>('rate_limits');
  const [cfg, setCfg] = useState<ConfigData | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const getToken = async () => {
    const { data: { session } } = await createClient().auth.getSession();
    return session?.access_token;
  };

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${API}/api/admin/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setCfg(data);
      const initial: Record<string, any> = {};
      for (const [k, v] of Object.entries(data.config as Record<string, ConfigEntry>)) {
        initial[k] = v.value;
      }
      setEdits(initial);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (key: string) => {
    const token = await getToken();
    if (!token) return;
    setSaving((p) => ({ ...p, [key]: true }));
    setErrors((p) => ({ ...p, [key]: '' }));

    const res = await fetch(`${API}/api/admin/config/${key}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: edits[key] }),
    });

    setSaving((p) => ({ ...p, [key]: false }));
    if (res.ok) {
      setSaved((p) => ({ ...p, [key]: true }));
      setTimeout(() => setSaved((p) => ({ ...p, [key]: false })), 2000);
      load();
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
      setErrors((p) => ({ ...p, [key]: error }));
    }
  };

  const val = (key: string, fallback: any = '') => edits[key] ?? cfg?.config[key]?.value ?? fallback;

  function NumberField({ cfgKey, label, min = 0, max = 10000, description }: {
    cfgKey: string; label: string; min?: number; max?: number; description?: string;
  }) {
    return (
      <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
        <div className="flex-1 min-w-0">
          <label className="text-sm font-medium text-slate-800">{label}</label>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
          <SavedBadge entry={cfg?.config[cfgKey]} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            min={min}
            max={max}
            value={val(cfgKey, 0)}
            onChange={(e) => setEdits((p) => ({ ...p, [cfgKey]: Number(e.target.value) }))}
            className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
          />
          <button
            onClick={() => save(cfgKey)}
            disabled={saving[cfgKey]}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors w-16"
          >
            {saving[cfgKey] ? '…' : saved[cfgKey] ? '✓' : 'Save'}
          </button>
        </div>
        {errors[cfgKey] && <p className="text-red-600 text-xs w-full">{errors[cfgKey]}</p>}
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'rate_limits', label: 'Rate Limits' },
    { id: 'moderation', label: 'Content Moderation' },
    { id: 'ai_models', label: 'AI Models' },
    { id: 'maintenance', label: 'Maintenance' },
  ];

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-500">
      <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
      Loading configuration…
    </div>
  );

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Global Configuration</h1>
        <p className="text-sm text-slate-500 mt-0.5">Runtime settings stored in the database. Changes take effect on next request.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-fit px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Rate Limits */}
      {tab === 'rate_limits' && (
        <div className="space-y-4">
          <Section
            title="Hourly AI Operations — Per Plan"
            desc="Maximum AI operations a tenant can enqueue per rolling hour. Prevents one tenant from consuming all capacity."
          >
            <NumberField cfgKey="rate_limit_free"    label="Free plan"    description="Default: 5 ops/hr (protects the 30/mo budget)" min={1} max={100} />
            <NumberField cfgKey="rate_limit_starter" label="Starter plan" description="Default: 50 ops/hr"  min={1} max={500} />
            <NumberField cfgKey="rate_limit_growth"  label="Growth plan"  description="Default: 200 ops/hr" min={1} max={2000} />
            <NumberField cfgKey="rate_limit_agency"  label="Agency plan"  description="Default: 1000 ops/hr (effectively unlimited)" min={1} max={10000} />
          </Section>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>Note:</strong> Changes to rate limits apply to new Redis windows only. Active windows are not retroactively adjusted. A deploy or Redis flush may be needed to apply immediately.
          </div>
        </div>
      )}

      {/* Content Moderation */}
      {tab === 'moderation' && (
        <div className="space-y-4">
          <Section
            title="Brand Quality Thresholds"
            desc="Controls when AI-generated content is auto-approved, held for review, or immediately escalated."
          >
            <NumberField
              cfgKey="brand_auto_approve_threshold"
              label="Auto-approve threshold"
              description="Content scoring above this is published without human review (default: 90)"
              min={50} max={100}
            />
            <NumberField
              cfgKey="brand_min_quality_score"
              label="Minimum quality score"
              description="Content below this is rejected outright. Between min and auto-approve it waits for review (default: 75)"
              min={0} max={100}
            />
            <NumberField
              cfgKey="brand_high_risk_threshold"
              label="High-risk threshold"
              description="Content below this is escalated to a human regardless of approval settings (default: 50)"
              min={0} max={100}
            />
          </Section>

          <Section title="Threshold Reference" desc="Visual guide for how content flows at different scores.">
            <div className="relative h-8 bg-slate-100 rounded-full overflow-hidden">
              <div className="absolute left-0 top-0 h-full bg-red-400/70" style={{ width: `${val('brand_high_risk_threshold', 50)}%` }} />
              <div className="absolute top-0 h-full bg-amber-400/70" style={{
                left: `${val('brand_high_risk_threshold', 50)}%`,
                width: `${val('brand_min_quality_score', 75) - val('brand_high_risk_threshold', 50)}%`,
              }} />
              <div className="absolute top-0 h-full bg-sky-400/70" style={{
                left: `${val('brand_min_quality_score', 75)}%`,
                width: `${val('brand_auto_approve_threshold', 90) - val('brand_min_quality_score', 75)}%`,
              }} />
              <div className="absolute top-0 h-full bg-emerald-400/70" style={{
                left: `${val('brand_auto_approve_threshold', 90)}%`,
                right: 0,
              }} />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span className="text-red-600">0 — Escalate</span>
              <span className="text-amber-600">{val('brand_high_risk_threshold', 50)} — Reject</span>
              <span className="text-sky-600">{val('brand_min_quality_score', 75)} — Review</span>
              <span className="text-emerald-600">{val('brand_auto_approve_threshold', 90)} — Auto-approve</span>
              <span>100</span>
            </div>
          </Section>
        </div>
      )}

      {/* AI Models */}
      {tab === 'ai_models' && (
        <div className="space-y-4">
          <Section
            title="Active AI Models"
            desc="Model selection is configured via environment variables. Set ANTHROPIC_API_KEY and the models below are used."
          >
            <div className="space-y-3">
              {[
                { label: 'Primary Model', key: 'PRIMARY', use: 'Content generation, analytics, orchestration', model: cfg?.defaults.models.PRIMARY },
                { label: 'Fast Model', key: 'FAST', use: 'Brand checks, customer service, quick tasks', model: cfg?.defaults.models.FAST },
              ].map(({ label, use, model }) => (
                <div key={label} className="flex items-start justify-between gap-4 py-3 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{label}</p>
                    <p className="text-xs text-slate-400">{use}</p>
                  </div>
                  <div className="text-right">
                    <code className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-mono">{model || 'not set'}</code>
                    <p className="text-xs text-slate-400 mt-1">via env var</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Model Pricing Reference" desc="Costs per million tokens (USD). Used for usage tracking and billing estimates.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 font-medium">Model</th>
                    <th className="pb-2 font-medium text-right">Input /M</th>
                    <th className="pb-2 font-medium text-right">Output /M</th>
                    <th className="pb-2 font-medium text-right">Cache Read /M</th>
                    <th className="pb-2 font-medium text-right">Cache Write /M</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[
                    { model: 'claude-sonnet-4-6', input: '$3.00', output: '$15.00', cacheR: '$0.30', cacheW: '$3.75' },
                    { model: 'claude-haiku-4-5-20251001', input: '$0.25', output: '$1.25', cacheR: '$0.03', cacheW: '$0.30' },
                  ].map((r) => (
                    <tr key={r.model} className="hover:bg-slate-50">
                      <td className="py-2"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono">{r.model}</code></td>
                      <td className="py-2 text-right text-slate-600">{r.input}</td>
                      <td className="py-2 text-right text-slate-600">{r.output}</td>
                      <td className="py-2 text-right text-slate-600">{r.cacheR}</td>
                      <td className="py-2 text-right text-slate-600">{r.cacheW}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {/* Maintenance */}
      {tab === 'maintenance' && (
        <div className="space-y-4">
          <Section title="Maintenance Mode" desc="When enabled, the platform shows a maintenance banner and blocks new AI operations.">
            <div className="flex items-center justify-between py-2 mb-4">
              <div>
                <p className="text-sm font-medium text-slate-800">Enable maintenance mode</p>
                <p className="text-xs text-slate-400">Blocks new job enqueuing and shows a banner to all users</p>
              </div>
              <button
                onClick={async () => {
                  const current = val('maintenance_mode', false);
                  setEdits((p) => ({ ...p, maintenance_mode: !current }));
                  await save('maintenance_mode');
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                  val('maintenance_mode', false) ? 'bg-rose-600' : 'bg-slate-200'
                }`}
                role="switch"
                aria-checked={val('maintenance_mode', false)}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  val('maintenance_mode', false) ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {val('maintenance_mode', false) && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">
                <p className="text-rose-800 text-sm font-semibold">⚠️ Maintenance mode is ACTIVE</p>
                <p className="text-rose-600 text-xs mt-0.5">New AI operations are being blocked. Remember to disable when done.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5">Maintenance message</label>
              <p className="text-xs text-slate-400 mb-2">Shown to users in the dashboard banner</p>
              <textarea
                rows={3}
                value={val('maintenance_message', '')}
                onChange={(e) => setEdits((p) => ({ ...p, maintenance_message: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none resize-none"
              />
              <div className="flex justify-between items-center mt-2">
                <SavedBadge entry={cfg?.config['maintenance_message']} />
                <button
                  onClick={() => save('maintenance_message')}
                  disabled={saving['maintenance_message']}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
                >
                  {saving['maintenance_message'] ? 'Saving…' : saved['maintenance_message'] ? '✓ Saved' : 'Save message'}
                </button>
              </div>
            </div>
          </Section>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
            <p className="font-semibold mb-1">Other maintenance actions</p>
            <ul className="space-y-1 text-xs text-slate-500">
              <li>• To flush Redis caches, use the Upstash console or <code className="bg-white px-1 py-0.5 rounded">FLUSHDB</code> via Redis CLI</li>
              <li>• To pause individual job queues, use the Job Queues admin page</li>
              <li>• To suspend a specific tenant, use the Tenants admin page</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
