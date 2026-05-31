'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { API_URL } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContentVariation {
  text: string;
  hashtags?: string[];
  qualityScore?: number;
  approved?: boolean;
}

interface ScheduledPost {
  id: string;
  platform: string;
  content_type: string;
  created_at: string;
  scheduled_at: string | null;
  status: string;
  variations?: ContentVariation[];
  selectedVariation?: number;
  brandReview?: { status: string; qualityScore?: number; feedback?: string };
  input?: Record<string, unknown>;
  imageUrl?: string;
  imageStatus?: string;
  imageModel?: string;
  imageGeneratingAt?: string;
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
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
    },
    ...opts,
  });
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

function ImageGenerationProgress({ since }: { since: string | undefined }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = since ? new Date(since).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);

  const fmt = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  const isStuck = elapsed >= 180;
  const isSlow  = elapsed >= 90;
  // Progress bar fills over 90s then holds at 95% to indicate "still working"
  const pct = isStuck ? 100 : Math.min(95, (elapsed / 90) * 100);

  if (isStuck) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
          <span>⚠</span> Generation appears stalled ({fmt(elapsed)})
        </p>
        <p className="text-xs text-slate-400">The worker may have timed out. Click Retry to queue a new attempt.</p>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Spinner />
          {isSlow ? 'Still generating — taking a bit longer than usual…' : 'Generating image…'}
        </p>
        <span className="text-xs text-slate-400 tabular-nums">{fmt(elapsed)}</span>
      </div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${isSlow ? 'bg-amber-400' : 'bg-indigo-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!isSlow && <p className="text-xs text-slate-400">Typical: 20–60 seconds</p>}
    </div>
  );
}

// ── Tab: Scheduled ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  posted: 'bg-green-100 text-green-700',
  needs_revision: 'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-slate-100 text-slate-500',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function ScheduledTab() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [regenerating, setRegenerating] = useState<Record<string, boolean>>({});

  const fetchPosts = useCallback(() =>
    apiFetch<{ data: ScheduledPost[] }>('/api/analytics/content?limit=30')
      .then((d) => setPosts(d.data || []))
      .catch(() => {}), []);

  async function regenerateImage(id: string) {
    setRegenerating((r) => ({ ...r, [id]: true }));
    try {
      await apiFetch(`/api/content/${id}/regenerate-image`, { method: 'POST' });
      setPosts((prev) => prev.map((p) => p.id === id ? { ...p, imageStatus: 'generating' } : p));
    } catch { /* leave current state */ }
    finally { setRegenerating((r) => ({ ...r, [id]: false })); }
  }

  // Initial load
  useEffect(() => {
    fetchPosts().finally(() => setLoading(false));
  }, [fetchPosts]);

  // Poll every 6s while any post is still generating
  useEffect(() => {
    const hasGenerating = posts.some((p) => p.imageStatus === 'generating');
    if (!hasGenerating) return;
    const id = setInterval(fetchPosts, 6000);
    return () => clearInterval(id);
  }, [posts, fetchPosts]);

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
            <th className="w-8 px-3 py-3" />
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Platform</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Type</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Created</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Score</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p, i) => {
            const isOpen = expanded[p.id || i];
            const selected = p.variations?.[p.selectedVariation ?? 0];
            return (
              <React.Fragment key={p.id || i}>
                <tr
                  onClick={() => setExpanded((e) => ({ ...e, [p.id || i]: !e[p.id || i] }))}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-3 py-3 text-slate-400 text-xs">{isOpen ? '▼' : '▶'}</td>
                  <td className="px-4 py-3 capitalize text-slate-700 font-medium">{p.platform || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{String(p.content_type || '').replace(/_/g, ' ') || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[p.status] || STATUS_STYLES.pending}`}>
                      {p.status || 'pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {p.brandReview?.qualityScore != null ? `${p.brandReview.qualityScore}/100` : '—'}
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${p.id || i}-detail`} className="bg-slate-50 border-b border-slate-200">
                    <td colSpan={6} className="px-5 py-4">
                      {/* Brand review feedback */}
                      {p.brandReview?.feedback && (
                        <p className="text-xs text-slate-500 italic mb-3 border-l-2 border-indigo-200 pl-3">
                          {p.brandReview.feedback}
                        </p>
                      )}
                      {/* All variations */}
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        {p.variations?.length ?? 0} variation{(p.variations?.length ?? 0) !== 1 ? 's' : ''} generated
                      </p>
                      <div className="space-y-3">
                        {(p.variations || []).map((v, vi) => (
                          <div
                            key={vi}
                            className={`rounded-lg border p-3 ${vi === (p.selectedVariation ?? 0) ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                {vi === (p.selectedVariation ?? 0) && (
                                  <span className="text-xs font-medium text-indigo-600 mb-1 block">★ Selected</span>
                                )}
                                <p className="text-sm text-slate-800 whitespace-pre-wrap">{v.text}</p>
                                {v.hashtags?.length ? (
                                  <p className="text-xs text-indigo-500 mt-1">{v.hashtags.map((h) => `#${h}`).join(' ')}</p>
                                ) : null}
                              </div>
                              <CopyButton text={v.hashtags?.length ? `${v.text}\n\n${v.hashtags.map((h) => `#${h}`).join(' ')}` : v.text} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Generated image — only for approved social captions */}
                      {(p.status === 'approved' || p.brandReview?.status === 'approved') && (
                        <div className="mt-4 pt-4 border-t border-slate-200">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              Generated Image
                              {p.imageModel && (
                                <span className="ml-2 font-normal text-slate-400 normal-case">{p.imageModel}</span>
                              )}
                            </p>
                            <button
                              onClick={(e) => { e.stopPropagation(); regenerateImage(p.id); }}
                              disabled={regenerating[p.id] || (p.imageStatus === 'generating' && !!p.imageGeneratingAt && (Date.now() - new Date(p.imageGeneratingAt).getTime()) < 180000)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40"
                            >
                              {regenerating[p.id]
                                ? 'Queuing…'
                                : p.imageUrl
                                  ? 'Regenerate'
                                  : p.imageStatus === 'failed'
                                    ? 'Retry'
                                    : p.imageStatus === 'generating' && p.imageGeneratingAt && (Date.now() - new Date(p.imageGeneratingAt).getTime()) >= 180000
                                      ? 'Retry'
                                      : 'Generate'}
                            </button>
                          </div>
                          {(regenerating[p.id] || p.imageStatus === 'generating') ? (
                            <ImageGenerationProgress since={regenerating[p.id] ? undefined : p.imageGeneratingAt} />
                          ) : p.imageStatus === 'failed' ? (
                            <p className="text-xs text-red-400 flex items-center gap-1">
                              ⚠ Image generation failed — click Retry to try again.
                            </p>
                          ) : p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt="Generated social image"
                              className="rounded-lg max-h-64 object-cover border border-slate-200"
                            />
                          ) : (
                            <ImageGenerationProgress since={undefined} />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Product Image Uploader ────────────────────────────────────────────────────

function ProductImageUploader({
  imageUrl,
  setImageUrl,
  wasProcessed,
  setWasProcessed,
}: {
  imageUrl: string;
  setImageUrl: (url: string) => void;
  wasProcessed: boolean;
  setWasProcessed: (v: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Image must be under 10 MB'); return; }

    setUploading(true);
    setError('');
    setImageUrl('');
    setWasProcessed(false);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/media/product-image`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: file,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || 'Upload failed');
      }
      const { url, wasBackgroundRemoved } = await res.json() as { url: string; wasBackgroundRemoved: boolean };
      setImageUrl(url);
      setWasProcessed(wasBackgroundRemoved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-uploaded if needed
      e.target.value = '';
    }
  }

  return (
    <div className="md:col-span-2">
      <label className="block text-xs font-medium text-slate-600 mb-1">
        Product Image <span className="text-slate-400 font-normal">(optional)</span>
      </label>
      <p className="text-xs text-slate-400 mb-2">
        Upload your product photo — the background is automatically removed so it composites cleanly onto the AI‑generated scene.
      </p>

      {imageUrl ? (
        <div className="flex items-start gap-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          {/* Checkerboard bg visualises transparency */}
          <div
            className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-slate-200"
            style={{ backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, #f8fafc 0% 50%)', backgroundSize: '14px 14px' }}
          >
            <img src={imageUrl} alt="Product" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            {wasProcessed ? (
              <p className="text-xs text-emerald-600 font-medium mb-1">✓ Background removed</p>
            ) : (
              <p className="text-xs text-amber-600 font-medium mb-1">Background not removed — set REMOVEBG_API_KEY to enable automatic removal</p>
            )}
            <p className="text-xs text-slate-400 mb-2 truncate">{imageUrl.split('/').pop()}</p>
            <button
              type="button"
              onClick={() => { setImageUrl(''); setWasProcessed(false); }}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <label className={`flex items-center gap-3 p-4 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            className="sr-only"
          />
          <div className="text-slate-400 shrink-0">
            {uploading ? <Spinner /> : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm text-slate-600 font-medium">
              {uploading ? 'Uploading & removing background…' : 'Click to upload product photo'}
            </p>
            <p className="text-xs text-slate-400">JPG, PNG, WebP — max 10 MB</p>
          </div>
        </label>
      )}

      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
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

  // Product image state
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productImageProcessed, setProductImageProcessed] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const body = contentType === 'social_caption'
        ? { type: 'social_caption', platform, theme, product: product || undefined, productImageUrl: productImageUrl || undefined }
        : { type: 'image_brief', platform, format: imgFormat, concept, product: product || undefined, mood: mood || undefined, copyOverlay: copyOverlay || undefined, productImageUrl: productImageUrl || undefined };
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

          <ProductImageUploader
            imageUrl={productImageUrl}
            setImageUrl={setProductImageUrl}
            wasProcessed={productImageProcessed}
            setWasProcessed={setProductImageProcessed}
          />
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

// ── Tab: Repurpose ────────────────────────────────────────────────────────────

interface RepurposePost {
  platform: string;
  caption: string;
  hashtags: string[];
  angle: string;
}

interface RepurposeResult {
  contentId?: string;
  summary: string;
  posts: RepurposePost[];
  keyInsights: string[];
  source: string;
  sourceTitle: string;
}

interface PlatformImageState {
  childContentId: string | null;
  imageStatus: 'idle' | 'generating' | 'generated' | 'failed';
  imageUrl: string | null;
  imageGeneratingAt: string | null;
}

const REPURPOSE_PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'pinterest', label: 'Pinterest' },
];

const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📸',
  facebook: '👥',
  twitter: '🐦',
  linkedin: '💼',
  pinterest: '📌',
};

function RepurposeTab() {
  const [url, setUrl] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['instagram', 'facebook', 'twitter', 'linkedin']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RepurposeResult | null>(null);
  const [error, setError] = useState('');
  const [copiedPlatform, setCopiedPlatform] = useState<string | null>(null);
  // keyed by platform → state for that platform's image
  const [imageStates, setImageStates] = useState<Record<string, PlatformImageState>>({});
  // keyed by platform → childContentId, only while actively polling
  const [pollingIds, setPollingIds] = useState<Record<string, string>>({});

  // Poll every 3 s for any platforms currently generating an image
  useEffect(() => {
    const entries = Object.entries(pollingIds);
    if (entries.length === 0) return;

    const interval = setInterval(async () => {
      await Promise.all(entries.map(async ([platform, childContentId]) => {
        try {
          const status = await apiFetch<{ imageStatus: string; imageUrl: string | null; imageGeneratingAt: string | null }>(
            `/api/content/${childContentId}/image-status`
          );
          if (status.imageStatus === 'generated' || status.imageStatus === 'failed') {
            setImageStates((prev) => ({
              ...prev,
              [platform]: {
                ...prev[platform],
                imageStatus: status.imageStatus as 'generated' | 'failed',
                imageUrl: status.imageUrl,
              },
            }));
            setPollingIds((prev) => {
              const next = { ...prev };
              delete next[platform];
              return next;
            });
          }
        } catch { /* ignore transient poll errors */ }
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, [pollingIds]);

  function togglePlatform(id: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleRepurpose() {
    if (!url.trim() || selectedPlatforms.length === 0) return;
    setLoading(true);
    setError('');
    setResult(null);
    setImageStates({});
    setPollingIds({});
    try {
      const data = await apiFetch<RepurposeResult>('/api/content/repurpose', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim(), platforms: selectedPlatforms }),
      });
      setResult(data);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateImage(platform: string) {
    if (!result?.contentId) return;
    setImageStates((prev) => ({
      ...prev,
      [platform]: { childContentId: null, imageStatus: 'generating', imageUrl: null, imageGeneratingAt: new Date().toISOString() },
    }));
    try {
      const { childContentId } = await apiFetch<{ childContentId: string }>(
        '/api/content/repurpose-image',
        { method: 'POST', body: JSON.stringify({ contentId: result.contentId, platform }) }
      );
      setImageStates((prev) => ({ ...prev, [platform]: { ...prev[platform], childContentId } }));
      setPollingIds((prev) => ({ ...prev, [platform]: childContentId }));
    } catch (e: unknown) {
      setImageStates((prev) => ({ ...prev, [platform]: { ...prev[platform], imageStatus: 'failed' } }));
    }
  }

  function copyCaption(post: RepurposePost) {
    const full = post.hashtags?.length
      ? `${post.caption}\n\n${post.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}`
      : post.caption;
    navigator.clipboard.writeText(full);
    setCopiedPlatform(post.platform);
    setTimeout(() => setCopiedPlatform(null), 2000);
  }

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-xs text-slate-500 mb-4">
          Paste a YouTube video URL or any article link. We&apos;ll extract the content and generate platform-optimised posts in your brand voice.
        </p>
        <div className="space-y-4">
          <div>
            <Label>URL (YouTube or article)</Label>
            <Input
              value={url}
              onChange={setUrl}
              placeholder="https://youtube.com/watch?v=… or https://example.com/article"
            />
          </div>

          <div>
            <Label>Generate posts for</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {REPURPOSE_PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    selectedPlatforms.includes(p.id)
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {PLATFORM_ICONS[p.id]} {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleRepurpose}
            disabled={loading || !url.trim() || selectedPlatforms.length === 0}
            className="px-6 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <><Spinner />Extracting &amp; generating…</> : 'Repurpose Content'}
          </button>
        </div>
      </Card>

      {result && (
        <div className="space-y-4">
          {/* Source summary */}
          <Card className="bg-slate-50">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Source — {result.source === 'youtube_transcript' ? 'YouTube transcript' : result.source === 'youtube_title_only' ? 'YouTube (no captions found)' : 'Article'}
              </p>
              <p className="text-sm font-medium text-slate-800 truncate">{result.sourceTitle}</p>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{result.summary}</p>
            </div>
          </Card>

          {/* Key insights */}
          {result.keyInsights?.length > 0 && (
            <Card>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Key Insights</p>
              <ul className="space-y-2">
                {result.keyInsights.map((insight, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-slate-400 font-mono shrink-0">{i + 1}.</span>
                    <span className="leading-relaxed">{insight}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Per-platform posts */}
          {result.posts.map((post) => {
            const imgState: PlatformImageState = imageStates[post.platform] ?? { childContentId: null, imageStatus: 'idle', imageUrl: null, imageGeneratingAt: null };
            return (
              <Card key={post.platform}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{PLATFORM_ICONS[post.platform] || '📄'}</span>
                    <span className="font-semibold text-slate-800 capitalize">{post.platform}</span>
                    {post.angle && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
                        {post.angle}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => copyCaption(post)}
                    className="text-xs text-slate-400 hover:text-slate-700 transition-colors px-2 py-1 rounded hover:bg-slate-50"
                  >
                    {copiedPlatform === post.platform ? '✓ Copied' : 'Copy'}
                  </button>
                </div>

                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {post.caption}
                </div>

                {post.hashtags?.length > 0 && (
                  <p className="text-xs text-blue-500 mt-2">
                    {post.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}
                  </p>
                )}

                {/* Image generation section */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  {imgState.imageStatus === 'idle' && (
                    <button
                      onClick={() => handleGenerateImage(post.platform)}
                      disabled={!result.contentId}
                      className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    >
                      Generate image
                    </button>
                  )}

                  {imgState.imageStatus === 'generating' && (
                    <ImageGenerationProgress since={imgState.imageGeneratingAt ?? undefined} />
                  )}

                  {imgState.imageStatus === 'generated' && imgState.imageUrl && (
                    <div className="space-y-2">
                      <img
                        src={imgState.imageUrl}
                        alt={`${post.platform} generated image`}
                        className="w-full rounded-lg object-cover max-h-64"
                      />
                      <div className="flex gap-3">
                        <a
                          href={imgState.imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          Open full size
                        </a>
                        <button
                          onClick={() => {
                            setImageStates((prev) => ({ ...prev, [post.platform]: { childContentId: null, imageStatus: 'idle', imageUrl: null, imageGeneratingAt: null } }));
                          }}
                          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  )}

                  {imgState.imageStatus === 'failed' && (
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-red-500">Image generation failed.</p>
                      <button
                        onClick={() => handleGenerateImage(post.platform)}
                        className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1 rounded-lg transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
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
  { id: 'repurpose', label: 'Repurpose' },
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

      <div className="flex border-b border-slate-200 mb-6 gap-1 overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
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
      {tab === 'repurpose' && <RepurposeTab />}
    </div>
  );
}
