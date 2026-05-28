'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiRequest } from '@/lib/api';

interface BrandConfig {
  identity?: { name?: string; tagline?: string; positioning?: string; markets?: string[]; website?: string; logoUrl?: string };
  voice?: { tone?: string; personality?: string[]; doList?: string[]; dontList?: string[] };
  audience?: { primary?: string; secondary?: string };
  compliance?: { pricing?: string };
  visual?: { style?: string; colorPalette?: string[] };
}

interface ApprovalGate {
  require_content_approval: boolean;
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

export default function BrandSettingsPage() {
  const supabase = createClient();
  const [config, setConfig] = useState<BrandConfig>({});
  const [approvalGate, setApprovalGate] = useState(false);
  const [savingGate, setSavingGate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const [brandData, gateData] = await Promise.all([
          apiRequest<BrandConfig>('/api/tenants/me/brand-config', session.access_token),
          apiRequest<ApprovalGate>('/api/content/approval-gate', session.access_token),
        ]);
        setConfig(brandData);
        setApprovalGate(gateData.require_content_approval);
      } catch {
        setError('Failed to load brand config');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleApprovalGate(enabled: boolean) {
    setSavingGate(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      await apiRequest('/api/content/approval-gate', session.access_token, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      setApprovalGate(enabled);
    } catch { /* silent */ }
    finally { setSavingGate(false); }
  }

  function set(path: string[], value: unknown) {
    setConfig((prev) => {
      const next = structuredClone(prev) as Record<string, unknown>;
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {};
        obj = obj[path[i]] as Record<string, unknown>;
      }
      obj[path[path.length - 1]] = value;
      return next as BrandConfig;
    });
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${session.user.id}/logo.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('brand-assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(path);

      // Update local state so preview renders immediately
      const updatedConfig = {
        ...config,
        identity: { ...config.identity, logoUrl: publicUrl },
      };
      setConfig(updatedConfig);

      // Auto-save so the URL is persisted without requiring a manual Save click
      await apiRequest('/api/tenants/me/brand-config', session.access_token, {
        method: 'PUT',
        body: JSON.stringify(updatedConfig),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function save() {
    setSaving(true); setSaved(false); setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      await apiRequest('/api/tenants/me/brand-config', session.access_token, {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4 sm:p-8 text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">Brand Settings</h1>
        <button
          onClick={save}
          disabled={saving}
          className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <div className="space-y-6">
        <Section title="Identity">
          <Field label="Brand Name">
            <input type="text" value={config.identity?.name ?? ''} onChange={(e) => set(['identity', 'name'], e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tagline">
            <input type="text" value={config.identity?.tagline ?? ''} onChange={(e) => set(['identity', 'tagline'], e.target.value)} className={inputCls} />
          </Field>
          <Field label="Website">
            <input type="url" value={config.identity?.website ?? ''} onChange={(e) => set(['identity', 'website'], e.target.value)} className={inputCls} placeholder="https://yoursite.com" />
          </Field>
          <Field label="Positioning">
            <textarea value={config.identity?.positioning ?? ''} onChange={(e) => set(['identity', 'positioning'], e.target.value)} rows={3} className={inputCls} />
          </Field>
          <Field label="Markets (comma-separated)">
            <input
              type="text"
              value={config.identity?.markets?.join(', ') ?? ''}
              onChange={(e) => set(['identity', 'markets'], e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
              className={inputCls}
            />
          </Field>
          <Field label="Brand Logo">
            <div className="flex items-center gap-4">
              {config.identity?.logoUrl ? (
                <div className="relative w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                  <img src={config.identity.logoUrl} alt="Brand logo" className="max-w-full max-h-full object-contain p-1" />
                  <button
                    type="button"
                    onClick={() => set(['identity', 'logoUrl'], '')}
                    className="absolute top-1 right-1 bg-white rounded-full w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-500 shadow-sm border border-slate-200 text-xs"
                  >✕</button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs text-center">
                  No logo
                </div>
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                >
                  {uploadingLogo ? 'Uploading…' : config.identity?.logoUrl ? 'Replace logo' : 'Upload logo'}
                </button>
                {!uploadingLogo && config.identity?.logoUrl && (
                  <p className="text-xs text-emerald-600 mt-1">Logo saved ✓</p>
                )}
                <p className="text-xs text-slate-400 mt-1">PNG or SVG with transparent background recommended.<br/>Overlaid on generated images automatically.</p>
              </div>
            </div>
          </Field>
        </Section>

        <Section title="Brand Voice">
          <Field label="Tone description">
            <textarea value={config.voice?.tone ?? ''} onChange={(e) => set(['voice', 'tone'], e.target.value)} rows={3} className={inputCls} />
          </Field>
          <Field label="Personality traits (comma-separated)">
            <input
              type="text"
              value={config.voice?.personality?.join(', ') ?? ''}
              onChange={(e) => set(['voice', 'personality'], e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
              className={inputCls}
            />
          </Field>
          <Field label="Do list (one per line)">
            <textarea
              value={config.voice?.doList?.join('\n') ?? ''}
              onChange={(e) => set(['voice', 'doList'], e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
              rows={4}
              className={inputCls}
            />
          </Field>
          <Field label="Don't list (one per line)">
            <textarea
              value={config.voice?.dontList?.join('\n') ?? ''}
              onChange={(e) => set(['voice', 'dontList'], e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
              rows={4}
              className={inputCls}
            />
          </Field>
        </Section>

        <Section title="Target Audience">
          <Field label="Primary audience">
            <textarea value={config.audience?.primary ?? ''} onChange={(e) => set(['audience', 'primary'], e.target.value)} rows={3} className={inputCls} />
          </Field>
          <Field label="Secondary audience">
            <textarea value={config.audience?.secondary ?? ''} onChange={(e) => set(['audience', 'secondary'], e.target.value)} rows={2} className={inputCls} />
          </Field>
        </Section>

        <Section title="Content Publishing">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-700">Require human approval before publishing</p>
              <p className="text-xs text-slate-500 mt-0.5">
                When enabled, AI-generated content that passes brand review is held in the{' '}
                <a href="/dashboard/content/approvals" className="text-indigo-600 hover:underline">Approvals queue</a>{' '}
                until you approve it. Disable to auto-publish immediately.
              </p>
            </div>
            <button
              onClick={() => toggleApprovalGate(!approvalGate)}
              disabled={savingGate}
              className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${approvalGate ? 'bg-indigo-600' : 'bg-slate-300'} disabled:opacity-60`}
              role="switch"
              aria-checked={approvalGate}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${approvalGate ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>
        </Section>

        <Section title="Visual Identity">
          <p className="text-xs text-slate-400 -mt-2">Used to guide AI image generation. Leave blank to skip.</p>
          <Field label="Visual style">
            <input
              type="text"
              placeholder="e.g. minimalist luxury, warm lifestyle photography, bold and vibrant"
              value={config.visual?.style ?? ''}
              onChange={(e) => set(['visual', 'style'], e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Brand colors">
            <ColorPaletteInput
              value={config.visual?.colorPalette ?? []}
              onChange={(colors) => set(['visual', 'colorPalette'], colors)}
            />
          </Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ColorPaletteInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  function update(i: number, hex: string) {
    const next = [...value];
    next[i] = hex.toUpperCase();
    onChange(next);
  }

  function add() {
    if (value.length < 5) onChange([...value, '#000000']);
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {value.map((hex, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="color"
            value={hex}
            onChange={(e) => update(i, e.target.value)}
            className="w-9 h-9 rounded border border-slate-200 cursor-pointer p-0.5"
          />
          <input
            type="text"
            value={hex}
            maxLength={7}
            onChange={(e) => update(i, e.target.value)}
            className="w-28 px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-slate-400 hover:text-red-500 text-sm px-1"
          >
            ✕
          </button>
        </div>
      ))}
      {value.length < 5 && (
        <button
          type="button"
          onClick={add}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          + Add color {value.length > 0 && `(${value.length}/5)`}
        </button>
      )}
      {value.length === 0 && (
        <p className="text-xs text-slate-400">No colors added — image generation will use default styling.</p>
      )}
    </div>
  );
}
