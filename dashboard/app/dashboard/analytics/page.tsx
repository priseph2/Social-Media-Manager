'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { API_URL } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface MonthlyReport {
  id: string;
  period: string;
  title?: string;
  overall_score: number | null;
  generated_at: string;
}

interface FullReport {
  period: string;
  headline?: string;
  overall_score?: { score: number; trend: string; context: string };
  channels?: Array<{
    name: string;
    status: string;
    keyMetric?: string;
    vsTarget?: string;
    vsBenchmark?: string;
    insight: string;
  }>;
  wins?: string[];
  concerns?: string[];
  priorityActions?: Array<{
    action: string;
    owner: string;
    urgency: string;
    expectedImpact: string;
  }>;
  nextWeekFocus?: string;
  markdown?: string;
  generated_at?: string;
}

interface AttributedContent {
  contentId: string;
  totalRevenue: number;
  currency: string;
  attributionCount: number;
  avgConfidence: string;
  content?: {
    platform?: string;
    type?: string;
    variations?: Array<{ text: string }>;
    postedAt?: string;
  };
}

interface BenchmarkResult {
  overallPosition: 'leading' | 'on_par' | 'lagging' | 'insufficient_data';
  channelComparisons: Array<{
    channel: string;
    tenantValue: number | string;
    benchmarkValue: number | string;
    unit: string;
    verdict: string;
    gap?: string;
  }>;
  competitiveAdvantages: string[];
  gapsToClose: string[];
  priorityRecommendations: string[];
}

interface PredictionResult {
  success: boolean;
  jobId?: string;
  message?: string;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  on_track: 'bg-emerald-100 text-emerald-700',
  above_target: 'bg-blue-100 text-blue-700',
  needs_attention: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
  no_data: 'bg-slate-100 text-slate-500',
};

const STATUS_ICONS: Record<string, string> = {
  on_track: '✅',
  above_target: '🚀',
  needs_attention: '⚠️',
  critical: '🚨',
  no_data: '⬜',
};

const URGENCY_COLOURS: Record<string, string> = {
  this_week: 'bg-red-100 text-red-700',
  this_month: 'bg-amber-100 text-amber-700',
  when_possible: 'bg-slate-100 text-slate-600',
};

const POSITION_COLOURS: Record<string, string> = {
  leading: 'text-emerald-600',
  on_par: 'text-blue-600',
  lagging: 'text-amber-600',
  insufficient_data: 'text-slate-400',
};

const POSITION_LABELS: Record<string, string> = {
  leading: 'Leading',
  on_par: 'On Par',
  lagging: 'Lagging',
  insufficient_data: 'Insufficient Data',
};

function scoreColour(score: number | null) {
  if (score === null) return 'text-slate-400';
  if (score >= 75) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${API_URL}/api/analytics${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
    },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-slate-800 mb-4">{children}</h2>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
      {children}
    </div>
  );
}

function Badge({ label, colour }: { label: string; colour: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colour}`}>{label}</span>
  );
}

// ── Report Viewer ────────────────────────────────────────────────────────────

function ReportViewer({ period, onClose }: { period: string; onClose: () => void }) {
  const [report, setReport] = useState<FullReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'structured' | 'narrative'>('structured');

  useEffect(() => {
    apiFetch<FullReport>(`/reports/${period}`)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto py-10 px-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Report — {period}</h3>
          <div className="flex items-center gap-3">
            {report?.markdown && (
              <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setTab('structured')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${tab === 'structured' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  Structured
                </button>
                <button
                  onClick={() => setTab('narrative')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${tab === 'narrative' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  Narrative
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
          </div>
        </div>

        <div className="p-6">
          {loading && <p className="text-slate-500 text-sm">Loading report…</p>}
          {error && <p className="text-red-500 text-sm">{error}</p>}

          {report && tab === 'narrative' && report.markdown && (
            <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{report.markdown}</pre>
          )}

          {report && tab === 'structured' && (
            <div className="space-y-6">
              {report.headline && (
                <p className="text-slate-700 font-medium italic">&ldquo;{report.headline}&rdquo;</p>
              )}

              {report.overall_score && (
                <div className="flex items-center gap-3">
                  <span className={`text-4xl font-bold ${scoreColour(report.overall_score.score)}`}>
                    {report.overall_score.score}
                  </span>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">Overall Score</p>
                    <p className="text-sm text-slate-600">{report.overall_score.trend} — {report.overall_score.context}</p>
                  </div>
                </div>
              )}

              {report.channels && report.channels.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Channels</p>
                  <div className="space-y-3">
                    {report.channels.map((c, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="text-lg leading-none">{STATUS_ICONS[c.status] || '•'}</span>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {c.name}
                            {c.keyMetric && <span className="font-normal text-slate-500 ml-2">{c.keyMetric}</span>}
                            {c.vsTarget && <span className="text-xs text-slate-400 ml-1">({c.vsTarget})</span>}
                            {c.vsBenchmark && <span className="text-xs text-blue-500 ml-1">[vs industry: {c.vsBenchmark}]</span>}
                          </p>
                          <p className="text-xs text-slate-500">{c.insight}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {report.wins && report.wins.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Wins</p>
                    <ul className="space-y-1">
                      {report.wins.map((w, i) => <li key={i} className="text-sm text-slate-700">✓ {w}</li>)}
                    </ul>
                  </div>
                )}
                {report.concerns && report.concerns.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Concerns</p>
                    <ul className="space-y-1">
                      {report.concerns.map((c, i) => <li key={i} className="text-sm text-slate-700">⚠ {c}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {report.priorityActions && report.priorityActions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Priority Actions</p>
                  <div className="space-y-2">
                    {report.priorityActions.map((a, i) => (
                      <div key={i} className="flex gap-3 items-start border border-slate-100 rounded-lg p-3">
                        <span className="text-slate-400 font-mono text-xs w-5 shrink-0">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800">{a.action}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Owner: {a.owner} · Impact: {a.expectedImpact}</p>
                        </div>
                        <Badge label={a.urgency.replace(/_/g, ' ')} colour={URGENCY_COLOURS[a.urgency] || 'bg-slate-100 text-slate-600'} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.nextWeekFocus && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Next Focus</p>
                  <p className="text-sm text-slate-700">{report.nextWeekFocus}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [attribution, setAttribution] = useState<AttributedContent[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [loadingAttribution, setLoadingAttribution] = useState(true);
  const [loadingBenchmark, setLoadingBenchmark] = useState(false);
  const [errorReports, setErrorReports] = useState('');
  const [errorAttribution, setErrorAttribution] = useState('');
  const [errorBenchmark, setErrorBenchmark] = useState('');
  const [viewingPeriod, setViewingPeriod] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportMsg, setReportMsg] = useState('');
  const [benchmarkMsg, setBenchmarkMsg] = useState('');

  // Prediction form
  const [predContent, setPredContent] = useState('');
  const [predPlatform, setPredPlatform] = useState('instagram');
  const [predicting, setPredicting] = useState(false);
  const [predMsg, setPredMsg] = useState('');

  const loadReports = useCallback(() => {
    apiFetch<{ reports: MonthlyReport[] }>('/reports')
      .then((d) => setReports(d.reports || []))
      .catch((e) => setErrorReports(e.message))
      .finally(() => setLoadingReports(false));
  }, []);

  const loadAttribution = useCallback(() => {
    apiFetch<{ topContent: AttributedContent[] }>('/attribution?days=30')
      .then((d) => setAttribution(d.topContent || []))
      .catch((e) => setErrorAttribution(e.message))
      .finally(() => setLoadingAttribution(false));
  }, []);

  useEffect(() => {
    loadReports();
    loadAttribution();
  }, [loadReports, loadAttribution]);

  async function handleGenerateReport() {
    setGeneratingReport(true);
    setReportMsg('');
    try {
      const data = await apiFetch<{ message: string; period: string }>('/reports/generate', { method: 'POST', body: '{}' });
      setReportMsg(`${data.message} (${data.period})`);
      setTimeout(loadReports, 5000);
    } catch (e: unknown) {
      setReportMsg((e as Error).message);
    } finally {
      setGeneratingReport(false);
    }
  }

  async function handleRunBenchmark() {
    setLoadingBenchmark(true);
    setErrorBenchmark('');
    setBenchmarkMsg('');
    try {
      const data = await apiFetch<{ message: string }>('/benchmark', { method: 'POST', body: '{}' });
      setBenchmarkMsg(data.message || 'Benchmark queued — results will appear once the job completes.');
    } catch (e: unknown) {
      setErrorBenchmark((e as Error).message);
    } finally {
      setLoadingBenchmark(false);
    }
  }

  async function handlePredict() {
    if (!predContent.trim()) return;
    setPredicting(true);
    setPredMsg('');
    try {
      const res = await apiFetch<PredictionResult>('/predict-performance', {
        method: 'POST',
        body: JSON.stringify({ contentText: predContent, platform: predPlatform }),
      });
      if (res.success) {
        setPredMsg(`Prediction queued (job ${res.jobId}). Results will be saved to the content record once ready.`);
      } else {
        setPredMsg(res.error || 'Unknown error');
      }
    } catch (e: unknown) {
      setPredMsg((e as Error).message);
    } finally {
      setPredicting(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Advanced Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Reports, benchmarking, attribution &amp; performance prediction</p>
        </div>
      </div>

      {/* ── Monthly Reports ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Monthly Reports</SectionTitle>
          <div className="flex items-center gap-3">
            {reportMsg && <p className="text-xs text-slate-500 max-w-xs">{reportMsg}</p>}
            <button
              onClick={handleGenerateReport}
              disabled={generatingReport}
              className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {generatingReport ? 'Queuing…' : 'Generate Report'}
            </button>
          </div>
        </div>

        {loadingReports && <p className="text-sm text-slate-400">Loading reports…</p>}
        {errorReports && (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            {errorReports.includes('advancedAnalytics') || errorReports.includes('403')
              ? 'Advanced Analytics is not enabled on your current plan.'
              : errorReports}
          </p>
        )}

        {!loadingReports && !errorReports && reports.length === 0 && (
          <Card className="text-center py-10">
            <p className="text-slate-400 text-sm">No reports generated yet.</p>
            <p className="text-slate-400 text-xs mt-1">Click &ldquo;Generate Report&rdquo; to create your first monthly report.</p>
          </Card>
        )}

        {reports.length > 0 && (
          <div className="grid gap-3">
            {reports.map((r) => (
              <Card key={r.id} className="flex items-center justify-between hover:border-slate-300 transition-colors">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-slate-800">{r.period}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Generated {fmt(r.generated_at)}</p>
                  </div>
                  {r.overall_score !== null && (
                    <span className={`text-2xl font-bold ${scoreColour(r.overall_score)}`}>
                      {r.overall_score}
                      <span className="text-xs font-normal text-slate-400">/100</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setViewingPeriod(r.period)}
                  className="px-4 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  View
                </button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Competitor Benchmark ────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Competitor Benchmark</SectionTitle>
          <div className="flex items-center gap-3">
            {benchmarkMsg && <p className="text-xs text-slate-500 max-w-xs">{benchmarkMsg}</p>}
            <button
              onClick={handleRunBenchmark}
              disabled={loadingBenchmark}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {loadingBenchmark ? 'Queueing…' : 'Run Benchmark'}
            </button>
          </div>
        </div>

        {errorBenchmark && <p className="text-sm text-red-500 mb-3">{errorBenchmark}</p>}

        {!benchmark && !benchmarkMsg && (
          <Card className="text-center py-10">
            <p className="text-slate-400 text-sm">No benchmark data available.</p>
            <p className="text-slate-400 text-xs mt-1">Run a benchmark to compare your metrics against your industry.</p>
          </Card>
        )}

        {benchmark && (
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <p className="text-sm text-slate-500">Overall position:</p>
              <span className={`text-lg font-semibold ${POSITION_COLOURS[benchmark.overallPosition]}`}>
                {POSITION_LABELS[benchmark.overallPosition]}
              </span>
            </div>

            {benchmark.channelComparisons.length > 0 && (
              <div className="overflow-x-auto mb-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 pb-2 pr-4">Channel</th>
                      <th className="text-right text-xs font-semibold text-slate-500 pb-2 pr-4">Yours</th>
                      <th className="text-right text-xs font-semibold text-slate-500 pb-2 pr-4">Benchmark</th>
                      <th className="text-left text-xs font-semibold text-slate-500 pb-2">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benchmark.channelComparisons.map((row, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-2 pr-4 text-slate-700">{row.channel}</td>
                        <td className="py-2 pr-4 text-right font-mono text-slate-800">
                          {row.tenantValue}{row.unit}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-slate-500">
                          {row.benchmarkValue}{row.unit}
                        </td>
                        <td className="py-2 text-slate-600">{row.verdict}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {benchmark.competitiveAdvantages.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">Advantages</p>
                  <ul className="space-y-1">
                    {benchmark.competitiveAdvantages.map((a, i) => (
                      <li key={i} className="text-xs text-slate-700">✓ {a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {benchmark.gapsToClose.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Gaps to Close</p>
                  <ul className="space-y-1">
                    {benchmark.gapsToClose.map((g, i) => (
                      <li key={i} className="text-xs text-slate-700">△ {g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        )}
      </section>

      {/* ── Revenue Attribution ─────────────────────────────────────────── */}
      <section>
        <SectionTitle>Top Revenue-Attributed Content (Last 30 Days)</SectionTitle>

        {loadingAttribution && <p className="text-sm text-slate-400">Loading attribution…</p>}
        {errorAttribution && (
          <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            {errorAttribution.includes('advancedAnalytics') || errorAttribution.includes('403')
              ? 'Advanced Analytics is not enabled on your current plan.'
              : errorAttribution}
          </p>
        )}

        {!loadingAttribution && !errorAttribution && attribution.length === 0 && (
          <Card className="text-center py-10">
            <p className="text-slate-400 text-sm">No revenue attribution data yet.</p>
            <p className="text-slate-400 text-xs mt-1">Attribution is calculated automatically when Shopify orders are received.</p>
          </Card>
        )}

        {attribution.length > 0 && (
          <div className="grid gap-3">
            {attribution.map((item, i) => (
              <Card key={item.contentId || i} className="flex items-start gap-4">
                <span className="text-xl font-bold text-slate-200 w-7 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  {item.content?.variations?.[0]?.text && (
                    <p className="text-sm text-slate-800 line-clamp-2 mb-1">
                      {item.content.variations[0].text}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.content?.platform && (
                      <Badge label={item.content.platform} colour="bg-slate-100 text-slate-600" />
                    )}
                    {item.content?.type && (
                      <Badge label={item.content.type.replace(/_/g, ' ')} colour="bg-slate-100 text-slate-600" />
                    )}
                    <Badge
                      label={`${item.avgConfidence} confidence`}
                      colour={item.avgConfidence === 'high' ? 'bg-emerald-100 text-emerald-700' : item.avgConfidence === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}
                    />
                    {item.content?.postedAt && (
                      <span className="text-xs text-slate-400">{fmt(item.content.postedAt)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-semibold text-slate-900">
                    {item.currency} {item.totalRevenue.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">{item.attributionCount} order{item.attributionCount !== 1 ? 's' : ''}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Content Performance Predictor ───────────────────────────────── */}
      <section>
        <SectionTitle>Content Performance Prediction</SectionTitle>
        <Card>
          <p className="text-xs text-slate-500 mb-4">
            Paste draft content below to get an AI-powered engagement and reach forecast before publishing.
          </p>
          <div className="space-y-3">
            <div className="flex gap-3">
              <select
                value={predPlatform}
                onChange={(e) => setPredPlatform(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="twitter">Twitter / X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>
            <textarea
              value={predContent}
              onChange={(e) => setPredContent(e.target.value)}
              rows={5}
              placeholder="Paste your draft caption, copy, or post text here…"
              className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-400"
            />
            <div className="flex items-center gap-4">
              <button
                onClick={handlePredict}
                disabled={predicting || !predContent.trim()}
                className="px-5 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                {predicting ? 'Queuing…' : 'Predict Performance'}
              </button>
              {predMsg && <p className="text-xs text-slate-500 max-w-sm">{predMsg}</p>}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            Predictions are run asynchronously. Results are stored on the content record and visible in the Content tab.
          </p>
        </Card>
      </section>

      {/* ── Report Viewer Modal ─────────────────────────────────────────── */}
      {viewingPeriod && (
        <ReportViewer period={viewingPeriod} onClose={() => setViewingPeriod(null)} />
      )}
    </div>
  );
}
