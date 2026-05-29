'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiRequest } from '@/lib/api';

interface Connection { platform: string; status: string; connected_at: string; }
interface IntegrationField { key: string; label: string; type: string; }
interface Integration { id: string; name: string; desc: string; category: string; isEcommerce?: boolean; fields: IntegrationField[]; }

const INTEGRATIONS: Integration[] = [
  { id: 'buffer', name: 'Buffer', desc: 'Social media scheduling — posts to Twitter/X, LinkedIn, Pinterest and more', category: 'Social', fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }] },
  { id: 'mailchimp', name: 'Mailchimp', desc: 'Email marketing', category: 'Email', fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }, { key: 'serverPrefix', label: 'Server Prefix (e.g. us1)', type: 'text' }] },
  { id: 'ecommerce', name: 'E-commerce', desc: 'Shopify, WooCommerce, BigCommerce, Wix', category: 'Store', isEcommerce: true, fields: [] },
  { id: 'meta', name: 'Meta / Instagram', desc: 'Facebook & Instagram API', category: 'Social', fields: [{ key: 'accessToken', label: 'Access Token', type: 'password' }, { key: 'pageId', label: 'Page ID', type: 'text' }] },
  { id: 'ga4', name: 'Google Analytics 4', desc: 'Website analytics', category: 'Analytics', fields: [
    { key: 'propertyId', label: 'Property ID (numeric)', type: 'text' },
    { key: 'clientEmail', label: 'Service Account Email', type: 'text' },
    { key: 'privateKey', label: 'Service Account Private Key (PEM)', type: 'password' },
  ] },
  { id: 'whatsapp', name: 'WhatsApp Business', desc: 'Customer service via WhatsApp Cloud API', category: 'Messaging', fields: [
    { key: 'token', label: 'WhatsApp Access Token', type: 'password' },
    { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text' },
    { key: 'verifyToken', label: 'Webhook Verify Token (choose any string)', type: 'text' },
  ] },
  { id: 'tidio', name: 'Tidio Live Chat', desc: 'Website chat & customer service', category: 'Messaging', fields: [
    { key: 'apiKey', label: 'Tidio API Key', type: 'password' },
  ] },
  { id: 'canva', name: 'Canva', desc: 'Branded image generation from your Canva templates. Required when your image generator is set to Canva by your admin.', category: 'Design', fields: [
    { key: 'client_id', label: 'Client ID', type: 'text' },
    { key: 'client_secret', label: 'Client Secret', type: 'password' },
    { key: 'brand_template_id', label: 'Brand Template ID', type: 'text' },
  ] },
];

const ECOMMERCE_PLATFORMS = ['shopify', 'woocommerce', 'bigcommerce', 'wix'];

const ECOMMERCE_FIELDS: Record<string, IntegrationField[]> = {
  shopify: [
    { key: 'storeUrl', label: 'Store URL (e.g. my-store.myshopify.com)', type: 'text' },
    { key: 'accessToken', label: 'Admin API Access Token', type: 'password' },
  ],
  woocommerce: [
    { key: 'siteUrl', label: 'Site URL (e.g. https://mystore.com)', type: 'text' },
    { key: 'consumerKey', label: 'Consumer Key (ck_…)', type: 'password' },
    { key: 'consumerSecret', label: 'Consumer Secret (cs_…)', type: 'password' },
  ],
  bigcommerce: [
    { key: 'storeHash', label: 'Store Hash (from API path)', type: 'text' },
    { key: 'accessToken', label: 'Access Token', type: 'password' },
  ],
  wix: [
    { key: 'siteId', label: 'Site ID', type: 'text' },
    { key: 'accountId', label: 'Account ID (optional)', type: 'text' },
    { key: 'accessToken', label: 'API Key / Access Token', type: 'password' },
  ],
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

  const isConnected = (id: string) => connections.some((c) => c.platform === id && c.status === 'connected');

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Integrations</h1>
      <div className="space-y-3">
        {INTEGRATIONS.map((integration) => {
          const connected = isConnected(integration.id);
          const isOpen = activeForm === integration.id;
          return (
            <div key={integration.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{integration.name}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{integration.category}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{integration.desc}</p>
                </div>
                <div className="flex items-center gap-3">
                  {connected && <span className="text-xs text-green-600 font-medium">● Connected</span>}
                  <button
                    onClick={() => { setActiveForm(isOpen ? null : integration.id); setFormValues({}); setError(''); }}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    {connected ? 'Reconnect' : 'Connect'}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-slate-100 p-5 bg-slate-50">
                  {integration.isEcommerce && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-600 mb-1">Platform</label>
                      <select value={platformType} onChange={(e) => setPlatformType(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        {ECOMMERCE_PLATFORMS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                      </select>
                    </div>
                  )}
                  {(integration.isEcommerce ? (ECOMMERCE_FIELDS[platformType] ?? []) : integration.fields).map((field) => (
                    <div key={field.key} className="mb-3">
                      <label className="block text-sm font-medium text-slate-600 mb-1">{field.label}</label>
                      <input
                        type={field.type}
                        value={formValues[field.key] ?? ''}
                        onChange={(e) => setFormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  ))}
                  {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => save(integration.id)} disabled={saving} className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors">
                      {saving ? 'Saving…' : 'Save credentials'}
                    </button>
                    <button onClick={() => { setActiveForm(null); setFormValues({}); }} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2">Cancel</button>
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
