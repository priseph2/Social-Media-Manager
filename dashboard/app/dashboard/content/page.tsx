'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduledPost {
  id: string;
  platform: string;
  content_type: string;
  scheduled_at: string;
  status: string;
}

interface Localisation {
  language: string;
  languageName: string;
  text: string;
  rtl: boolean;
  hashtags: string[];
  culturalNotes: string;
  characterCount: number;
}

interface LocaliseResult {
  original: string;
  localisations: Localisation[];
  originalLanguage: string;
  translationQualityNotes: string;
  generatedAt: string;
}

interface GenerateResult {
  success?: boolean;
  jobId?: string;
  message?: string;
  error?: string;
  // Sync result fields
  type?: string;
  captions?: Array<{ text: string; angle: string; hashtags: string[] }>;
  hook?: { text: string; visualAction: string; hookType: string };
  scenes?: Array<{ sceneNumber: number; duration: string; action: string; dialogue: string; transition: string }>;
  totalDuration?: string;
  captions_script?: string[];
  cta?: string;
  productionNotes?: string;
  trendingAudioSuggestion?: string;
  contentPillar?: string;
  concept?: string;
  format?: { dimensions: string; aspectRatio: string; platform: string; fileType: string };
  moodKeywords?: string[];
  colorPalette?: Array<{ role: string; color: string; usage: string }>;
  typography?: { headline: string; body: string; copyOverlay: string };
  compositionNotes?: string;
  canvaTemplateCategory?: string;
  designerNotes?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORMS_CAPTION = ['instagram', 'facebook', 'twitter', 'pinterest'];
const PLATFORMS_VIDEO = ['tiktok', 'reels', 'shorts'];
const PLATFORMS_IMAGE = ['instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest', 'website', 'email'];
const VIDEO_DURATIONS = ['15s', '30s', '45s', '60s', '90s', '3min'];
const IMAGE_FORMATS = ['feed_square', 'feed_portrait', 'story', 'cover', 'ad_banner', 'email_header'];
const CONTENT_PILLARS = ['education', 'entertainment', 'inspiration', 'product_showcase', 'behind_the_scenes', 'trend_participation'];
const LANGUAGES: Record<string, string> = { fr: 'French', sw: 'Swahili', yo: 'Yoruba', ar: 'Arabic' };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600 mb-1">{children}</label>;
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-400"
    />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] | { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      {(options as (string | { value: string; label: string })[]).map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        return <option key={val} value={val}>{label}</option>;
      })}
    </select>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-slate-400 mr-2 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ── Tab: Scheduled ────────────────────────────────────────────────────────────

function ScheduledTab() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ data: ScheduledPost[] }>('/api/analytics/content?limit=30')
      .then((d) => setPosts(d.data || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>;

  if (!posts.length) {
    return (
      <Card className="text-center py-12">
        <p className="text-slate-400 text-sm">No content generated yet.</p>
        <p className="text-slate-400 text-xs mt-1">Use the &ldquo;Create&rdquo; or &ldquo;TikTok / Reels&rdquo; tabs to generate content.</p>
      </Card>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Platform</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Type</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Created</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {posts.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-5 py-3 capitalize text-slate-700">{p.platform || '—'}</td>
              <td className="px-5 py-3 text-slate-500">{String(p.content_type || '').replace(/_/g, ' ')}</td>
              <td className="px-5 py-3 text-slate-400 text-xs">
                {p.scheduled_at ? new Date(p.scheduled_at).toLocaleDateString('en-GB') : '—'}
              </td>
              <td className="px-5 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  (p as ScheduledPost & { brandReview?: { status: string } }).brandReview?.status === 'approved' || p.status === 'posted' ? 'bg-green-100 text-green-700' :
                  p.status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {p.status || 'pending'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tab: Caption / Image Brief generator ─────────────────────────────────────

function CreateTab() {
  const [contentType, setContentType] = useState<'social_caption' | 'image_brief'>('social_caption');
  const [platform, setPlatform] = useState('instagram');
  const [theme, setTheme] = useState('');
  const [product, setProduct] = useState('');
  const [concept, setConcept] = useState('');
  const [mood, setMood] = useState('');
  const [copyOverlay, setCopyOverlay] = useState('');
  const [imgFormat, setImgFormat] = useState('feed_square');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const body = contentType === 'social_caption'
        ? { type: 'social_caption', platform, theme, product: product || undefined }
        : { type: 'image_brief', platform, format: imgFormat, concept, product: product || undefined, mood: mood || undefined, copyOverlay: copyOverlay || undefined };
      const data = await apiFetch<GenerateResult>('/api/content/generate', { method: 'POST', body: JSON.stringify(body) });
      setResult(data);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex gap-3 mb-5">
          {(['social_caption', 'image_brief'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setContentType(t); setResult(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${contentType === t ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {t === 'social_caption' ? 'Social Caption' : 'Image Brief'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Platform</Label>
            <Select
              value={platform}
              onChange={setPlatform}
              options={contentType === 'social_caption' ? PLATFORMS_CAPTION : PLATFORMS_IMAGE}
            />
          </div>

          {contentType === 'social_caption' ? (
            <>
              <div>
                <Label>Theme / Topic</Label>
                <Input value={theme} onChange={setTheme} placeholder="e.g. New collection launch" />
              </div>
              <div className="md:col-span-2">
                <Label>Product (optional)</Label>
                <Input value={product} onChange={setProduct} placeholder="e.g. Rose Oud Eau de Parfum" />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Format</Label>
                <Select value={imgFormat} onChange={setImgFormat} options={IMAGE_FORMATS.map((f) => ({ value: f, label: f.replace(/_/g, ' ') }))} />
              </div>
              <div className="md:col-span-2">
                <Label>Visual Concept</Label>
                <Input value={concept} onChange={setConcept} placeholder="e.g. Minimalist product flatlay on marble surface" />
              </div>
              <div>
                <Label>Mood (optional)</Label>
                <Input value={mood} onChange={setMood} placeholder="e.g. Luxurious and warm" />
              </div>
              <div>
                <Label>Text Overlay (optional)</Label>
                <Input value={copyOverlay} onChange={setCopyOverlay} placeholder="e.g. New Arrivals — Shop Now" />
              </div>
              <div>
                <Label>Product (optional)</Label>
                <Input value={product} onChange={setProduct} placeholder="e.g. Velvet Rose Candle" />
              </div>
            </>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={loading || (contentType === 'social_caption' ? !theme.trim() : !concept.trim())}
          className="mt-5 px-6 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <><Spinner />Generating…</> : 'Generate'}
        </button>
      </Card>

      {/* ── Caption results ── */}
      {result?.captions && (
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Generated Captions</p>
          <div className="space-y-4">
            {result.captions.map((c, i) => (
              <div key={i} className={`p-4 rounded-lg border ${i === 0 ? 'border-slate-900 bg-slate-50' : 'border-slate-100'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-500">{c.angle}</span>
                  {i === 0 && <span className="text-xs bg-slate-900 text-white px-2 py-0.5 rounded">Recommended</span>}
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.text}</p>
                {c.hashtags?.length > 0 && (
                  <p className="text-xs text-blue-500 mt-2">{c.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Image brief results ── */}
      {result?.concept && result.type === 'image_brief' && (
        <Card>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Image Brief</p>
          <div className="space-y-4">
            {result.format && (
              <div className="flex gap-4 text-sm">
                <div><span className="text-slate-500 text-xs">Dimensions</span><p className="font-mono">{result.format.dimensions}</p></div>
                <div><span className="text-slate-500 text-xs">Ratio</span><p className="font-mono">{result.format.aspectRatio}</p></div>
                <div><span className="text-slate-500 text-xs">File</span><p className="font-mono">{result.format.fileType}</p></div>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500 mb-1">Concept</p>
              <p className="text-sm text-slate-800">{result.concept}</p>
            </div>
            {result.moodKeywords?.length && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Mood</p>
                <div className="flex flex-wrap gap-1">
                  {result.moodKeywords.map((k, i) => (
                    <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{k}</span>
                  ))}
                </div>
              </div>
            )}
            {result.colorPalette?.length && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Colour Palette</p>
                <div className="flex gap-2">
                  {result.colorPalette.map((c, i) => (
                    <div key={i} className="text-center">
                      <div
                        className="w-8 h-8 rounded border border-slate-200 mb-1"
                        style={{ backgroundColor: c.color.startsWith('#') ? c.color : '#e2e8f0' }}
                        title={c.color}
                      />
                      <p className="text-xs text-slate-500">{c.role}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.typography?.copyOverlay && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Text Overlay</p>
                <p className="text-sm font-semibold text-slate-800">&ldquo;{result.typography.copyOverlay}&rdquo;</p>
              </div>
            )}
            {result.compositionNotes && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Composition Notes</p>
                <p className="text-sm text-slate-700">{result.compositionNotes}</p>
              </div>
            )}
            {result.canvaTemplateCategory && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs text-blue-600 font-medium">Canva Template Search</p>
                <p className="text-sm text-blue-800 mt-0.5">{result.canvaTemplateCategory}</p>
              </div>
            )}
            {result.designerNotes && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Designer Notes</p>
                <p className="text-sm text-slate-600">{result.designerNotes}</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tab: TikTok / Reels Script ────────────────────────────────────────────────

function TikTokTab() {
  const [platform, setPlatform] = useState('tiktok');
  const [theme, setTheme] = useState('');
  const [product, setProduct] = useState('');
  const [duration, setDuration] = useState('45s');
  const [contentPillar, setContentPillar] = useState('');
  const [tone, setTone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const body = {
        type: 'tiktok_script', platform, theme, duration,
        product: product || undefined,
        contentPillar: contentPillar || undefined,
        tone: tone || undefined,
      };
      const data = await apiFetch<GenerateResult>('/api/content/generate', { method: 'POST', body: JSON.stringify(body) });
      setResult(data);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const platformLabel = platform === 'reels' ? 'Instagram Reels' : platform === 'shorts' ? 'YouTube Shorts' : 'TikTok';

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Platform</Label>
            <Select value={platform} onChange={setPlatform} options={PLATFORMS_VIDEO} />
          </div>
          <div>
            <Label>Target Duration</Label>
            <Select value={duration} onChange={setDuration} options={VIDEO_DURATIONS} />
          </div>
          <div className="md:col-span-2">
            <Label>Theme / Topic</Label>
            <Input value={theme} onChange={setTheme} placeholder="e.g. How to layer fragrances for summer" />
          </div>
          <div>
            <Label>Product (optional)</Label>
            <Input value={product} onChange={setProduct} placeholder="e.g. Rose Oud Perfume Oil" />
          </div>
          <div>
            <Label>Content Pillar (optional)</Label>
            <Select
              value={contentPillar}
              onChange={setContentPillar}
              options={[{ value: '', label: 'Auto-select' }, ...CONTENT_PILLARS.map((p) => ({ value: p, label: p.replace(/_/g, ' ') }))]}
            />
          </div>
          <div>
            <Label>Tone (optional)</Label>
            <Input value={tone} onChange={setTone} placeholder="e.g. fun and educational" />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <button
          onClick={handleGenerate}
          disabled={loading || !theme.trim()}
          className="mt-5 px-6 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <><Spinner />Generating script…</> : `Generate ${platformLabel} Script`}
        </button>
      </Card>

      {result?.hook && (
        <>
          <Card>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Hook (0:00–0:03)</p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-slate-900">&ldquo;{result.hook.text}&rdquo;</p>
              <p className="text-xs text-slate-500 mt-1">Visual: {result.hook.visualAction}</p>
              <span className="inline-block mt-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">{result.hook.hookType}</span>
            </div>
          </Card>

          {result.scenes && result.scenes.length > 0 && (
            <Card>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Script — {result.totalDuration} total
              </p>
              <div className="space-y-3">
                {result.scenes.map((s) => (
                  <div key={s.sceneNumber} className="flex gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                    <div className="w-16 shrink-0">
                      <span className="text-xs font-mono text-slate-400">{s.duration}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-800">{s.dialogue}</p>
                      <p className="text-xs text-slate-400 mt-0.5">📷 {s.action}</p>
                      <p className="text-xs text-slate-300 mt-0.5">→ {s.transition}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {result.cta && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">CTA</p>
                  <p className="text-sm text-slate-700">{result.cta}</p>
                </div>
              )}
              {result.trendingAudioSuggestion && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Audio Vibe</p>
                  <p className="text-sm text-slate-700">{result.trendingAudioSuggestion}</p>
                </div>
              )}
            </div>
          </Card>

          {result.scenes && result.scenes.length > 0 && (
            <Card>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Captions</p>
              <div className="space-y-2">
                {((result as GenerateResult & { captions: string[] }).captions || []).map((cap: string, i: number) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-50 text-sm text-slate-700">{cap}</div>
                ))}
              </div>
            </Card>
          )}

          {result.productionNotes && (
            <Card>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Production Notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{result.productionNotes}</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab: Localise ─────────────────────────────────────────────────────────────

function LocaliseTab() {
  const [content, setContent] = useState('');
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['fr']);
  const [contentType, setContentType] = useState('social_caption');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LocaliseResult | null>(null);
  const [error, setError] = useState('');

  function toggleLang(code: string) {
    setSelectedLangs((prev) => prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]);
  }

  async function handleLocalise() {
    if (!content.trim() || selectedLangs.length === 0) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await apiFetch<LocaliseResult>('/api/content/localise', {
        method: 'POST',
        body: JSON.stringify({ content, targetLanguages: selectedLangs, contentType }),
      });
      setResult(data);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-xs text-slate-500 mb-4">
          Paste any content and translate it into French, Swahili, Yoruba, or Arabic — preserving your brand voice and cultural context.
        </p>
        <div className="space-y-4">
          <div>
            <Label>Original Content</Label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Paste your caption, email copy, customer response, or any text here…"
              className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-400"
            />
          </div>

          <div>
            <Label>Content Type</Label>
            <Select
              value={contentType}
              onChange={setContentType}
              options={[
                { value: 'social_caption', label: 'Social Caption' },
                { value: 'email_campaign', label: 'Email' },
                { value: 'customer_response', label: 'Customer Response' },
                { value: 'product_description', label: 'Product Description' },
                { value: 'blog_post', label: 'Blog Post' },
              ]}
            />
          </div>

          <div>
            <Label>Target Languages</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {Object.entries(LANGUAGES).map(([code, name]) => (
                <button
                  key={code}
                  onClick={() => toggleLang(code)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selectedLangs.includes(code)
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {name}
                  {code === 'ar' && <span className="ml-1 text-xs opacity-60">RTL</span>}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handleLocalise}
            disabled={loading || !content.trim() || selectedLangs.length === 0}
            className="px-6 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <><Spinner />Translating…</> : 'Localise Content'}
          </button>
        </div>
      </Card>

      {result && (
        <div className="space-y-4">
          {result.translationQualityNotes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-amber-700 mb-0.5">Translation Notes</p>
              <p className="text-xs text-amber-600">{result.translationQualityNotes}</p>
            </div>
          )}

          {result.localisations.map((loc) => (
            <Card key={loc.language}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{loc.languageName}</span>
                  <span className="text-xs text-slate-400 font-mono">{loc.language}</span>
                  {loc.rtl && (
                    <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded">RTL</span>
                  )}
                </div>
                <span className="text-xs text-slate-400">{loc.characterCount} chars</span>
              </div>

              <div
                className={`bg-slate-50 rounded-lg p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed ${loc.rtl ? 'text-right' : ''}`}
                dir={loc.rtl ? 'rtl' : 'ltr'}
              >
                {loc.text}
              </div>

              {loc.hashtags?.length > 0 && (
                <p className="text-xs text-blue-500 mt-2">
                  {loc.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}
                </p>
              )}

              {loc.culturalNotes && (
                <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <p className="text-xs font-medium text-blue-600 mb-0.5">Cultural Adaptation</p>
                  <p className="text-xs text-blue-700">{loc.culturalNotes}</p>
                </div>
              )}

              <button
                onClick={() => navigator.clipboard.writeText(loc.text)}
                className="mt-3 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Copy text
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'create', label: 'Create' },
  { id: 'tiktok', label: 'TikTok / Reels' },
  { id: 'localise', label: 'Localise' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ContentPage() {
  const [tab, setTab] = useState<TabId>('scheduled');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Content Studio</h1>
        <p className="text-sm text-slate-500 mt-0.5">Generate, schedule, and localise your content</p>
      </div>

      <div className="flex border-b border-slate-200 mb-6 gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'scheduled' && <ScheduledTab />}
      {tab === 'create' && <CreateTab />}
      {tab === 'tiktok' && <TikTokTab />}
      {tab === 'localise' && <LocaliseTab />}
    </div>
  );
}
