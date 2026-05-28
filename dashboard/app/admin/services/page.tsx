'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

import { API_URL as API, timedFetch } from '@/lib/api';

interface ServiceCheck {
  status: 'ok' | 'degraded' | 'error' | 'not_configured' | 'configured';
  latencyMs?: number;
  error?: string;
}

interface ServicesData {
  services: Record<string, ServiceCheck>;
  checkedAt: string;
}

const SERVICE_META: Record<string, { label: string; category: string; description: string }> = {
  redis: { label: 'Redis (Upstash)', category: 'Infrastructure', description: 'Job queues, caching' },
  supabase: { label: 'Supabase', category: 'Infrastructure', description: 'Primary database, auth' },
  mongodb: { label: 'MongoDB Atlas', category: 'Infrastructure', description: 'Content & decisions store' },
  anthropic: { label: 'Anthropic Claude', category: 'AI', description: 'Content generation, analysis' },
  buffer: { label: 'Buffer', category: 'Social', description: 'Social post scheduling' },
  mailchimp: { label: 'Mailchimp', category: 'Email', description: 'Email campaign delivery' },
  paystack: { label: 'Paystack', category: 'Payments', description: 'Subscription billing' },
  openai: { label: 'OpenAI (DALL-E 3)', category: 'AI', description: 'Image generation — dalle3-standard / dalle3-hd' },
  google: { label: 'Google (Imagen 4)', category: 'AI', description: 'Image generation — imagen4-fast / imagen4-standard (default)' },
};

const STATUS_CONFIG: Record<string, { label: string; dotColor: string; bgColor: string; textColor: string }> = {
  ok: { label: 'Online', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
  configured: { label: 'Configured', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
  degraded: { label: 'Degraded', dotColor: 'bg-amber-500', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
  error: { label: 'Error', dotColor: 'bg-red-500', bgColor: 'bg-red-50', textColor: 'text-red-700' },
  not_configured: { label: 'Not Configured', dotColor: 'bg-slate-300', bgColor: 'bg-slate-50', textColor: 'text-slate-500' },
};

const CATEGORIES = ['Infrastructure', 'AI', 'Social', 'Email', 'Payments'];

export default function ServicesPage() {
  const [data, setData] = useState<ServicesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (tok?: string) => {
    const t = tok || token;
    if (!t) return;
    setRefreshing(true);
    try {
      const res = await timedFetch(`${API}/api/admin/services`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setToken(session.access_token);
      await load(session.access_token);
    }
    init();
  }, []);

  if (loading) return <div className="p-4 sm:p-8 text-sm text-slate-500">Checking services…</div>;
  if (error) return <div className="p-4 sm:p-8 text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const services = data.services;
  const online = Object.values(services).filter((s) => s.status === 'ok' || s.status === 'configured').length;
  const total = Object.keys(services).length;

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Service Health</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {online}/{total} services operational · Last checked {new Date(data.checkedAt).toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={refreshing}
          className="px-4 py-2 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? 'Checking…' : 'Re-check All'}
        </button>
      </div>

      {/* Overall status bar */}
      <div className={`rounded-xl border p-4 mb-6 ${online === total ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full animate-pulse ${online === total ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className={`text-sm font-medium ${online === total ? 'text-emerald-800' : 'text-amber-800'}`}>
            {online === total ? 'All systems operational' : `${total - online} service(s) need attention`}
          </span>
        </div>
      </div>

      {/* By category */}
      {CATEGORIES.map((category) => {
        const categoryServices = Object.entries(services).filter(
          ([key]) => SERVICE_META[key]?.category === category
        );
        if (!categoryServices.length) return null;

        return (
          <div key={category} className="mb-6">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{category}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categoryServices.map(([key, check]) => {
                const meta = SERVICE_META[key] || { label: key, description: '' };
                const cfg = STATUS_CONFIG[check.status] || STATUS_CONFIG.not_configured;
                return (
                  <div key={key} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dotColor}`} />
                          <span className="text-sm font-medium text-slate-800">{meta.label}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 ml-4">{meta.description}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bgColor} ${cfg.textColor}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="mt-3 ml-4 space-y-1">
                      {check.latencyMs !== undefined && (
                        <p className="text-xs text-slate-500">
                          Latency: <span className={`font-mono font-medium ${check.latencyMs > 500 ? 'text-amber-600' : 'text-slate-700'}`}>{check.latencyMs}ms</span>
                        </p>
                      )}
                      {check.error && (
                        <p className="text-xs text-red-500 font-mono truncate" title={check.error}>{check.error}</p>
                      )}
                      {check.status === 'not_configured' && (
                        <p className="text-xs text-slate-400">Set the required environment variable to enable this service.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Raw JSON for debugging */}
      <details className="mt-6">
        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">Raw health data</summary>
        <pre className="mt-2 p-4 bg-slate-900 text-slate-300 text-xs rounded-xl overflow-x-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
