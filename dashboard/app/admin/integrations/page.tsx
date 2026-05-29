'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

import { API_URL as API, timedFetch } from '@/lib/api';

interface ServicesData {
  services: Record<string, { status: string }>;
}

interface SyncDetail {
  id: string;
  tenantId: string;
  platform: string;
  bufferId?: string;
  status?: string;
  error?: string;
  reason?: string;
  skipped?: number;
  dryRun?: boolean;
}

interface SyncResult {
  synced: number;
  skipped: number;
  failed: number;
  totalFound: number;
  dryRun: boolean;
  details: SyncDetail[];
  message?: string;
}

const ENV_GROUPS: Array<{
  group: string;
  description: string;
  vars: Array<{ key: string; label: string; notes: string; serviceKey?: string }>;
}> = [
  {
    group: 'Core Infrastructure',
    description: 'Required for the platform to function',
    vars: [
      { key: 'SUPABASE_URL', label: 'Supabase URL', notes: 'Project URL from Supabase dashboard', serviceKey: 'supabase' },
      { key: 'SUPABASE_SERVICE_KEY', label: 'Supabase Service Key', notes: 'Service role key (bypasses RLS)', serviceKey: 'supabase' },
      { key: 'REDIS_URL', label: 'Redis URL', notes: 'Upstash Redis connection string (rediss://)', serviceKey: 'redis' },
      { key: 'MONGODB_URI', label: 'MongoDB URI', notes: 'Atlas connection string', serviceKey: 'mongodb' },
    ],
  },
  {
    group: 'AI Providers',
    description: 'Language model and image generation APIs',
    vars: [
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', notes: 'sk-ant-... — primary LLM for content generation', serviceKey: 'anthropic' },
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', notes: 'sk-... — required for DALL-E 3 image generation', serviceKey: 'openai' },
      { key: 'GOOGLE_API_KEY', label: 'Google AI API Key', notes: 'Gemini / Imagen 4 — required for Imagen 4 Fast & Standard providers', serviceKey: 'google' },
    ],
  },
  {
    group: 'Social Media',
    description: 'Social scheduling and posting',
    vars: [
      { key: 'BUFFER_ACCESS_TOKEN', label: 'Buffer Access Token', notes: 'From Buffer Developer dashboard', serviceKey: 'buffer' },
      { key: 'META_APP_ID', label: 'Meta App ID', notes: 'Facebook/Instagram Graph API app' },
      { key: 'META_APP_SECRET', label: 'Meta App Secret', notes: 'Facebook/Instagram Graph API secret' },
      { key: 'TWITTER_BEARER_TOKEN', label: 'Twitter Bearer Token', notes: 'Twitter API v2 bearer token' },
    ],
  },
  {
    group: 'Email',
    description: 'Email campaign delivery',
    vars: [
      { key: 'MAILCHIMP_API_KEY', label: 'Mailchimp API Key', notes: 'From Mailchimp Account → API Keys', serviceKey: 'mailchimp' },
      { key: 'MAILCHIMP_SERVER_PREFIX', label: 'Mailchimp Server Prefix', notes: 'e.g. us14 — found in API key' },
    ],
  },
  {
    group: 'Payments',
    description: 'Subscription billing',
    vars: [
      { key: 'PAYSTACK_SECRET_KEY', label: 'Paystack Secret Key', notes: 'sk_live_... or sk_test_...', serviceKey: 'paystack' },
      { key: 'PAYSTACK_PUBLIC_KEY', label: 'Paystack Public Key', notes: 'pk_live_... or pk_test_...' },
      { key: 'PAYSTACK_PLAN_CODE_STARTER', label: 'Plan Code: Starter', notes: 'From Paystack → Subscriptions → Plans' },
      { key: 'PAYSTACK_PLAN_CODE_GROWTH', label: 'Plan Code: Growth', notes: 'From Paystack → Subscriptions → Plans' },
      { key: 'PAYSTACK_PLAN_CODE_AGENCY', label: 'Plan Code: Agency', notes: 'From Paystack → Subscriptions → Plans' },
    ],
  },
  {
    group: 'Webhooks & Security',
    description: 'HMAC secrets and CORS',
    vars: [
      { key: 'PAYSTACK_WEBHOOK_SECRET', label: 'Paystack Webhook Secret', notes: 'HMAC secret for webhook verification' },
      { key: 'SHOPIFY_WEBHOOK_SECRET', label: 'Shopify Webhook Secret', notes: 'HMAC secret for Shopify webhooks' },
      { key: 'WHATSAPP_VERIFY_TOKEN', label: 'WhatsApp Verify Token', notes: 'Meta webhook verification token' },
      { key: 'ALLOWED_ORIGINS', label: 'Allowed CORS Origins', notes: 'Comma-separated, e.g. https://app.yourdomain.com' },
    ],
  },
  {
    group: 'E-Commerce',
    description: 'Shopify and GA4 integrations',
    vars: [
      { key: 'SHOPIFY_SHOP_DOMAIN', label: 'Shopify Shop Domain', notes: 'Per-tenant — set via API, not env' },
      { key: 'GA4_MEASUREMENT_ID', label: 'GA4 Measurement ID', notes: 'G-XXXXXXXXXX — per-tenant via credentials' },
    ],
  },
];

export default function IntegrationsPage() {
  const [services, setServices] = useState<Record<string, { status: string }>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await timedFetch(`${API}/api/admin/services`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const d: ServicesData = await res.json();
          setServices(d.services);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function runBufferSync(dryRun: boolean) {
    setSyncing(true);
    setSyncResult(null);
    setSyncError('');
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSyncError('Not authenticated'); return; }
      const res = await timedFetch(`${API}/api/admin/buffer/sync-scheduled${dryRun ? '?dryRun=true' : ''}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json: SyncResult = await res.json();
      if (!res.ok) { setSyncError((json as unknown as { error: string }).error || 'Sync failed'); return; }
      setSyncResult(json);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Global Integrations</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Environment variable configuration status for the backend API server.
          Set variables in <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs font-mono">.env</code> and restart the server.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-xs text-amber-800">
        <strong>Security note:</strong> Environment variables cannot be set through this UI — they require server access. This page shows current configuration status to help diagnose missing integrations.
      </div>

      {/* ── Buffer Sync Tool ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Buffer — Sync Scheduled Posts</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Push all future scheduled posts from the calendar to Buffer for every tenant that has a Buffer API key configured.
            Safe to run multiple times — posts already in Buffer are skipped.
          </p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => runBufferSync(true)}
              disabled={syncing}
              className="text-sm px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {syncing ? 'Running…' : 'Dry run (preview only)'}
            </button>
            <button
              onClick={() => runBufferSync(false)}
              disabled={syncing}
              className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {syncing ? 'Syncing…' : 'Push to Buffer'}
            </button>
          </div>

          {syncError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{syncError}</p>
          )}

          {syncResult && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                {syncResult.message ? (
                  <p className="text-slate-500 italic">{syncResult.message}</p>
                ) : (
                  <>
                    <span className="text-emerald-600 font-medium">{syncResult.synced} synced{syncResult.dryRun ? ' (dry run)' : ''}</span>
                    {syncResult.skipped > 0 && <span className="text-slate-400">{syncResult.skipped} skipped (no key)</span>}
                    {syncResult.failed > 0 && <span className="text-red-500 font-medium">{syncResult.failed} failed</span>}
                    <span className="text-slate-400 ml-auto">{syncResult.totalFound} total found</span>
                  </>
                )}
              </div>
              {syncResult.details.length > 0 && (
                <div className="bg-slate-50 rounded-lg border border-slate-100 divide-y divide-slate-100 max-h-64 overflow-y-auto text-xs font-mono">
                  {syncResult.details.map((d, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between gap-4">
                      <span className="text-slate-600 truncate">{d.platform} — tenant {String(d.tenantId).slice(0, 8)}…</span>
                      {d.error || d.reason ? (
                        <span className="text-red-500 shrink-0">{d.reason || d.error}</span>
                      ) : d.dryRun ? (
                        <span className="text-slate-400 shrink-0">would sync</span>
                      ) : (
                        <span className="text-emerald-600 shrink-0">{d.bufferId}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {ENV_GROUPS.map((group) => (
          <div key={group.group} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">{group.group}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {group.vars.filter((v) => v.serviceKey).map((v) => {
                    const svc = services[v.serviceKey!];
                    return svc ? (
                      <span
                        key={v.serviceKey}
                        className={`w-2 h-2 rounded-full ${svc.status === 'ok' || svc.status === 'configured' ? 'bg-emerald-500' : 'bg-red-400'}`}
                        title={`${v.serviceKey}: ${svc.status}`}
                      />
                    ) : null;
                  })}
                </div>
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {group.vars.map((v, i) => {
                  const svc = v.serviceKey ? services[v.serviceKey] : null;
                  const isConfigured = !loading && svc
                    ? (svc.status === 'ok' || svc.status === 'configured')
                    : undefined;

                  return (
                    <tr key={v.key} className={`border-t border-slate-50 ${i === 0 ? 'border-t-0' : ''}`}>
                      <td className="px-5 py-3 w-8">
                        {!loading && v.serviceKey && (
                          <span className={`w-2 h-2 rounded-full block ${isConfigured ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <code className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{v.key}</code>
                      </td>
                      <td className="py-3 pr-4 text-slate-700 font-medium text-sm">{v.label}</td>
                      <td className="py-3 pr-5 text-xs text-slate-400">{v.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-slate-900 rounded-xl p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick reference — .env template</p>
        <pre className="text-xs text-emerald-400 font-mono leading-relaxed overflow-x-auto whitespace-pre">
{`# Infrastructure
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
REDIS_URL=rediss://default:password@host:port
MONGODB_URI=mongodb+srv://user:pass@cluster/db

# AI — Language Models
ANTHROPIC_API_KEY=sk-ant-api03-...

# AI — Image Generation
OPENAI_API_KEY=sk-...           # DALL-E 3 provider
GOOGLE_API_KEY=AIza...          # Imagen 4 Fast / Standard providers

# Payments
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...

# Social
BUFFER_ACCESS_TOKEN=...

# Email
MAILCHIMP_API_KEY=...
MAILCHIMP_SERVER_PREFIX=us14

# Security
ALLOWED_ORIGINS=https://app.yourdomain.com`}
        </pre>
      </div>
    </div>
  );
}
