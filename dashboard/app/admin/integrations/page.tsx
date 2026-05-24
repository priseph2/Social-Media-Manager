'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ServicesData {
  services: Record<string, { status: string }>;
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
    description: 'Language model APIs',
    vars: [
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', notes: 'sk-ant-... — primary LLM for content generation', serviceKey: 'anthropic' },
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', notes: 'Optional — for embeddings or fallback', serviceKey: 'openai' },
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

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`${API}/api/admin/services`, {
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

  return (
    <div className="p-8 max-w-4xl">
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

# AI
ANTHROPIC_API_KEY=sk-ant-api03-...

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
