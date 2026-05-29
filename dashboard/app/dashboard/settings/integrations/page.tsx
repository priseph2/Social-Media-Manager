'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiRequest } from '@/lib/api';

interface Connection { platform: string; status: string; connected_at: string; metadata?: { platformType?: string }; }
interface IntegrationField { key: string; label: string; type: string; }
interface Integration { id: string; name: string; desc: string; category: string; isEcommerce?: boolean; fields: IntegrationField[]; }

const INTEGRATIONS: Integration[] = [
  { id: 'buffer',    name: 'Buffer',               desc: 'Social media scheduling — posts to Twitter/X, LinkedIn, Pinterest and more', category: 'Social',    fields: [{ key: 'apiKey',       label: 'API Key',             type: 'password' }] },
  { id: 'mailchimp', name: 'Mailchimp',             desc: 'Email marketing',                                                            category: 'Email',     fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }, { key: 'serverPrefix', label: 'Server Prefix (e.g. us1)', type: 'text' }] },
  { id: 'ecommerce', name: 'E-commerce',            desc: 'Shopify, WooCommerce, BigCommerce, Wix',                                    category: 'Store',     isEcommerce: true, fields: [] },
  { id: 'meta',      name: 'Meta / Instagram',      desc: 'Facebook & Instagram API',                                                  category: 'Social',    fields: [{ key: 'accessToken', label: 'Access Token', type: 'password' }, { key: 'pageId', label: 'Page ID', type: 'text' }] },
  { id: 'ga4',       name: 'Google Analytics 4',    desc: 'Website analytics',                                                         category: 'Analytics', fields: [
    { key: 'propertyId',  label: 'Property ID (numeric)',             type: 'text' },
    { key: 'clientEmail', label: 'Service Account Email',             type: 'text' },
    { key: 'privateKey',  label: 'Service Account Private Key (PEM)', type: 'password' },
  ] },
  { id: 'whatsapp',  name: 'WhatsApp Business',     desc: 'Customer service via WhatsApp Cloud API',                                   category: 'Messaging', fields: [
    { key: 'token',         label: 'WhatsApp Access Token',           type: 'password' },
    { key: 'phoneNumberId', label: 'Phone Number ID',                 type: 'text' },
    { key: 'verifyToken',   label: 'Webhook Verify Token',            type: 'text' },
  ] },
  { id: 'tidio',     name: 'Tidio Live Chat',        desc: 'Website chat & customer service',                                          category: 'Messaging', fields: [
    { key: 'apiKey', label: 'Tidio API Key', type: 'password' },
  ] },
  { id: 'canva',     name: 'Canva',                  desc: 'Branded image generation from your Canva templates',                       category: 'Design',    fields: [
    { key: 'client_id',          label: 'Client ID',           type: 'text' },
    { key: 'client_secret',      label: 'Client Secret',       type: 'password' },
    { key: 'brand_template_id',  label: 'Brand Template ID',   type: 'text' },
  ] },
];

const ECOMMERCE_PLATFORMS = ['shopify', 'woocommerce', 'bigcommerce', 'wix'];

const ECOMMERCE_FIELDS: Record<string, IntegrationField[]> = {
  shopify:      [{ key: 'storeUrl',       label: 'Store URL (e.g. my-store.myshopify.com)', type: 'text' },     { key: 'accessToken',    label: 'Admin API Access Token', type: 'password' }],
  woocommerce:  [{ key: 'siteUrl',        label: 'Site URL (e.g. https://mystore.com)',      type: 'text' },     { key: 'consumerKey',    label: 'Consumer Key (ck_…)',    type: 'password' }, { key: 'consumerSecret', label: 'Consumer Secret (cs_…)', type: 'password' }],
  bigcommerce:  [{ key: 'storeHash',      label: 'Store Hash (from API path)',                type: 'text' },     { key: 'accessToken',    label: 'Access Token',           type: 'password' }],
  wix:          [{ key: 'siteId',         label: 'Site ID',                                   type: 'text' },     { key: 'accountId',      label: 'Account ID (optional)',  type: 'text' },     { key: 'accessToken', label: 'API Key / Access Token', type: 'password' }],
};

const CATEGORY_COLORS: Record<string, string> = {
  Social: 'bg-blue-50 text-blue-600',
  Email: 'bg-violet-50 text-violet-600',
  Store: 'bg-amber-50 text-amber-700',
  Analytics: 'bg-teal-50 text-teal-600',
  Messaging: 'bg-green-50 text-green-600',
  Design: 'bg-rose-50 text-rose-600',
};

export default function IntegrationsPage() {
  const supabase = createClient();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [platformType, setPlatformType] = useState('shopify');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const data = await apiRequest<Connection[]>('/api/tenants/me/connections', session.access_token);
      setConnections(data);
    } catch { /* silently fail */ }
  }

  async function save(integrationId: string) {
    setSaving(true); setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const isEcommerce = INTEGRATIONS.find((i) => i.id === integrationId)?.isEcommerce;
      await apiRequest(`/api/tenants/me/credentials/${integrationId}`, session.access_token, {
        method: 'PUT',
        body: JSON.stringify({ credentials: formValues, platformType: isEcommerce ? platformType : undefined }),
      });
      setActiveForm(null);
      setFormValues({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function toggleForm(integrationId: string) {
    if (activeForm === integrationId) {
      setActiveForm(null);
      setFormValues({});
      setError('');
    } else {
      setActiveForm(integrationId);
      setFormValues({});
      setError('');
    }
  }

  function getConnection(id: string) {
    return connections.find((c) => c.platform === id && c.status === 'connected');
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900 mb-2">Integrations</h1>
      <p className="text-sm text-slate-500 mb-6">Connect your tools to enable scheduling, analytics, and messaging.</p>

      <div className="space-y-3">
        {INTEGRATIONS.map((integration) => {
          const connection = getConnection(integration.id);
          const connected = Boolean(connection);
          const isOpen = activeForm === integration.id;
          const fields = integration.isEcommerce ? (ECOMMERCE_FIELDS[platformType] ?? []) : integration.fields;
          const catColor = CATEGORY_COLORS[integration.category] || 'bg-slate-50 text-slate-500';

          return (
            <div
              key={integration.id}
              className={`bg-white rounded-xl border overflow-hidden transition-shadow ${connected ? 'border-emerald-200' : 'border-slate-200'} ${isOpen ? 'shadow-sm' : ''}`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Connected indicator dot */}
                  <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{integration.name}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${catColor}`}>{integration.category}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{integration.desc}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {connected && (
                    <span className="text-xs text-emerald-600 font-medium hidden sm:block">
                      Connected {connection?.connected_at ? new Date(connection.connected_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                    </span>
                  )}
                  <button
                    onClick={() => toggleForm(integration.id)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      connected
                        ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        : 'border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                    }`}
                  >
                    {isOpen ? 'Cancel' : connected ? 'Reconnect' : 'Connect'}
                  </button>
                </div>
              </div>

              {/* Expand form */}
              {isOpen && (
                <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 space-y-3">
                  {connected && (
                    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      <span className="text-emerald-500 mt-0.5">✓</span>
                      <p className="text-xs text-emerald-700">
                        Credentials are saved. Enter new values below to replace them.
                      </p>
                    </div>
                  )}

                  {integration.isEcommerce && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Platform</label>
                      <select
                        value={platformType}
                        onChange={(e) => setPlatformType(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {ECOMMERCE_PLATFORMS.map((p) => (
                          <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">{field.label}</label>
                      <input
                        type={field.type}
                        placeholder={connected && field.type === 'password' ? '••••••••  (saved)' : ''}
                        value={formValues[field.key] ?? ''}
                        onChange={(e) => setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                      />
                    </div>
                  ))}

                  {error && <p className="text-red-600 text-xs">{error}</p>}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => save(integration.id)}
                      disabled={saving}
                      className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                      {saving ? 'Saving…' : connected ? 'Update credentials' : 'Save credentials'}
                    </button>
                    <button
                      onClick={() => { setActiveForm(null); setFormValues({}); setError(''); }}
                      className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
