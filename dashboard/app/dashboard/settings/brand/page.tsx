'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiRequest } from '@/lib/api';

interface BrandConfig {
  identity?: { name?: string; tagline?: string; positioning?: string; markets?: string[] };
  voice?: { tone?: string; personality?: string[]; doList?: string[]; dontList?: string[] };
  audience?: { primary?: string; secondary?: string };
  compliance?: { pricing?: string };
  visual?: { style?: string; colorPalette?: string[] };
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

export default function BrandSettingsPage() {
  const supabase = createClient();
  const [config, setConfig] = useState<BrandConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const data = await apiRequest<BrandConfig>('/api/tenants/me/brand-config', session.access_token);
        setConfig(data);
      } catch {
        setError('Failed to load brand config');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
