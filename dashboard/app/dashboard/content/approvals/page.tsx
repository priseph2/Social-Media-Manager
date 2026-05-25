'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiRequest } from '@/lib/api';

interface Approval {
  id: string;
  content_preview: string | null;
  platform: string | null;
  content_type: string | null;
  brand_score: number | null;
  review_summary: string | null;
  status: 'pending' | 'approved' | 'rejected';
  decided_at: string | null;
  created_at: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-100 text-pink-700',
  facebook: 'bg-blue-100 text-blue-700',
  tiktok: 'bg-slate-900 text-white',
  twitter: 'bg-sky-100 text-sky-700',
  pinterest: 'bg-red-100 text-red-700',
  email_campaign: 'bg-violet-100 text-violet-700',
};

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color = score >= 90 ? 'text-green-600' : score >= 75 ? 'text-amber-600' : 'text-red-600';
  return <span className={`text-xs font-semibold ${color}`}>{score}/100</span>;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const { data } = await apiRequest<{ data: Approval[] }>('/api/content/approvals', session.access_token);
      setApprovals(data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) {
    setActionId(id);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      await apiRequest(`/api/content/approvals/${id}/approve`, session.access_token, { method: 'PATCH' });
      await load();
    } catch { /* silent */ }
    finally { setActionId(null); }
  }

  async function reject(id: string) {
    setActionId(id);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      await apiRequest(`/api/content/approvals/${id}/reject`, session.access_token, {
        method: 'PATCH',
        body: JSON.stringify({ reason: rejectReason || null }),
      });
      setRejectingId(null);
      setRejectReason('');
      await load();
    } catch { /* silent */ }
    finally { setActionId(null); }
  }

  const pending = approvals.filter((a) => a.status === 'pending');
  const decided = approvals.filter((a) => a.status !== 'pending');

  if (loading) return <div className="p-4 sm:p-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 mb-1">Content Approvals</h1>
      <p className="text-sm text-slate-500 mb-6">
        Review AI-generated content before it publishes. Enable this gate in{' '}
        <a href="/dashboard/settings/brand" className="text-indigo-600 hover:underline">Brand Settings</a>.
      </p>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-amber-700 mb-3">Awaiting review ({pending.length})</h2>
          <div className="space-y-4">
            {pending.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-amber-200 p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.platform && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PLATFORM_COLORS[a.platform] || 'bg-slate-100 text-slate-600'}`}>
                        {a.platform}
                      </span>
                    )}
                    {a.content_type && (
                      <span className="text-xs text-slate-500 capitalize">{a.content_type.replace(/_/g, ' ')}</span>
                    )}
                    <ScoreBadge score={a.brand_score} />
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{new Date(a.created_at).toLocaleString()}</span>
                </div>

                {a.review_summary && (
                  <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mb-3">
                    Brand AI: {a.review_summary}
                  </p>
                )}

                {a.content_preview && (
                  <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg px-3 py-2 mb-4 whitespace-pre-wrap line-clamp-4">
                    {a.content_preview}
                  </p>
                )}

                {rejectingId === a.id ? (
                  <div className="border-t border-slate-100 pt-3">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Rejection reason (optional)"
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-red-200 mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => reject(a.id)}
                        disabled={actionId === a.id}
                        className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
                      >
                        {actionId === a.id ? 'Rejecting…' : 'Confirm reject'}
                      </button>
                      <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 border-t border-slate-100 pt-3">
                    <button
                      onClick={() => approve(a.id)}
                      disabled={actionId === a.id}
                      className="text-xs bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors font-medium"
                    >
                      {actionId === a.id ? 'Publishing…' : '✓ Approve & publish'}
                    </button>
                    <button
                      onClick={() => { setRejectingId(a.id); setRejectReason(''); }}
                      className="text-xs border border-red-200 text-red-600 px-4 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decided */}
      {decided.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Recently decided ({decided.length})</h2>
          <div className="space-y-2 opacity-60">
            {decided.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {a.platform && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PLATFORM_COLORS[a.platform] || 'bg-slate-100 text-slate-600'}`}>
                        {a.platform}
                      </span>
                    )}
                    <ScoreBadge score={a.brand_score} />
                  </div>
                  {a.content_preview && (
                    <p className="text-xs text-slate-600 truncate">{a.content_preview}</p>
                  )}
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                  a.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!approvals.length && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">No content pending approval.</p>
          <p className="text-slate-300 text-xs mt-1">
            Content will appear here when the approval gate is enabled in Brand Settings.
          </p>
        </div>
      )}
    </div>
  );
}
