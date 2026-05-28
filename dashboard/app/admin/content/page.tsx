'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

import { API_URL as API, timedFetch } from '@/lib/api';

interface PendingItem {
  id: string;
  tenant_id: string;
  tenantName: string;
  skill: string;
  content_preview: string;
  quality_score: number;
  created_at: string;
  status: string;
}

function QualityBar({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-500';
  const textColor = score >= 75 ? 'text-emerald-700' : score >= 50 ? 'text-amber-700' : 'text-red-700';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className={`text-xs font-semibold ${textColor}`}>{score}</span>
    </div>
  );
}

export default function ContentApprovalPage() {
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    const res = await timedFetch(`${API}/api/admin/content/pending`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setPending(json.pending ?? []);
    } else {
      setError('Failed to load pending content');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleApprove = async (id: string) => {
    setProcessing((prev) => new Set(prev).add(id));
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) { setProcessing((prev) => { const s = new Set(prev); s.delete(id); return s; }); return; }
    const res = await timedFetch(`${API}/api/admin/content/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      setPending((prev) => prev.filter((item) => item.id !== id));
    }
    setProcessing((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };

  const handleRejectConfirm = async (id: string) => {
    setProcessing((prev) => new Set(prev).add(id));
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) { setProcessing((prev) => { const s = new Set(prev); s.delete(id); return s; }); return; }
    const res = await timedFetch(`${API}/api/admin/content/${id}/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: rejectReason }),
    });
    if (res.ok) {
      setPending((prev) => prev.filter((item) => item.id !== id));
    }
    setRejectingId(null);
    setRejectReason('');
    setProcessing((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-500">
      <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
      Loading content queue…
    </div>
  );

  if (error) return (
    <div className="p-8 text-red-600 text-sm bg-red-50 rounded-xl border border-red-200 mx-8">{error}</div>
  );

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">Content Approval Queue</h1>
            {pending.length > 0 && (
              <span className="text-xs font-semibold bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full">
                {pending.length} item{pending.length !== 1 ? 's' : ''} pending
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Items flagged by Brand Guardian for manual review</p>
        </div>
        <button
          onClick={load}
          className="text-xs font-medium text-rose-600 hover:text-rose-800 flex items-center gap-1.5 border border-rose-200 px-3 py-1.5 rounded-lg"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        {pending.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-slate-600 text-sm font-medium">All clear!</p>
            <p className="text-slate-400 text-xs mt-1">No content pending approval. Items appear here when AI quality score falls below the threshold.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="pb-2 font-medium">Tenant</th>
                  <th className="pb-2 font-medium">Skill</th>
                  <th className="pb-2 font-medium">Content Preview</th>
                  <th className="pb-2 font-medium">Quality Score</th>
                  <th className="pb-2 font-medium">Created</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pending.map((item) => {
                  const isExpanded = expanded.has(item.id);
                  const isProcessing = processing.has(item.id);
                  const isRejecting = rejectingId === item.id;
                  const preview = isExpanded
                    ? item.content_preview
                    : item.content_preview.length > 100
                      ? item.content_preview.slice(0, 100) + '…'
                      : item.content_preview;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 align-top">
                      <td className="py-3">
                        <Link href={`/admin/tenants/${item.tenant_id}`} className="text-indigo-600 hover:text-indigo-800 font-medium text-sm">
                          {item.tenantName}
                        </Link>
                      </td>
                      <td className="py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium capitalize">{item.skill}</span>
                      </td>
                      <td className="py-3 max-w-xs">
                        <button
                          onClick={() => toggleExpand(item.id)}
                          className="text-left text-slate-600 text-xs leading-relaxed hover:text-slate-900 transition-colors"
                        >
                          {preview}
                          {item.content_preview.length > 100 && (
                            <span className="text-indigo-500 ml-1">{isExpanded ? 'show less' : 'show more'}</span>
                          )}
                        </button>
                      </td>
                      <td className="py-3">
                        <QualityBar score={item.quality_score} />
                      </td>
                      <td className="py-3 text-slate-400 text-xs whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="py-3 text-right">
                        {isProcessing ? (
                          <div className="flex items-center justify-end gap-2 text-slate-400">
                            <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs">Processing…</span>
                          </div>
                        ) : isRejecting ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Reason (optional)"
                              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-rose-300"
                              autoFocus
                            />
                            <button
                              onClick={() => handleRejectConfirm(item.id)}
                              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => { setRejectingId(null); setRejectReason(''); }}
                              className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApprove(item.id)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => { setRejectingId(item.id); setRejectReason(''); }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-4">
        Auto-refreshes every 30 seconds. Approved items are published immediately; rejected items are archived with the reason provided.
      </p>
    </div>
  );
}
