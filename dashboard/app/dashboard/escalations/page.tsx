'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiRequest } from '@/lib/api';

interface Escalation {
  id: string;
  type: string;
  reason: string;
  skill: string;
  human_note: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export default function EscalationsPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const { data } = await apiRequest<{ data: Escalation[] }>('/api/analytics/escalations', session.access_token);
      setEscalations(data || []);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string) {
    setResolvingId(id);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      await apiRequest(`/api/analytics/escalations/${id}/resolve`, session.access_token, {
        method: 'PATCH',
        body: JSON.stringify({ humanNote: noteText || null }),
      });
      setNoteId(null);
      setNoteText('');
      await load();
    } catch { /* silently fail */ }
    finally { setResolvingId(null); }
  }

  const open = escalations.filter((e) => !e.resolved);
  const resolved = escalations.filter((e) => e.resolved);

  if (loading) return <div className="p-4 sm:p-8 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Escalations</h1>

      {open.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-amber-700 mb-3">Open ({open.length})</h2>
          <div className="space-y-3">
            {open.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-amber-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 capitalize">
                      {e.type.replace(/_/g, ' ')}
                    </p>
                    {e.reason && <p className="text-xs text-slate-500 mt-0.5">{e.reason}</p>}
                    {e.skill && <p className="text-xs text-slate-400 mt-1">Skill: {e.skill}</p>}
                    <p className="text-xs text-slate-400 mt-2">{new Date(e.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">open</span>
                    <button
                      onClick={() => { setNoteId(noteId === e.id ? null : e.id); setNoteText(''); }}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Resolve
                    </button>
                  </div>
                </div>

                {noteId === e.id && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <textarea
                      value={noteText}
                      onChange={(ev) => setNoteText(ev.target.value)}
                      placeholder="Add a note (optional)"
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => resolve(e.id)}
                        disabled={resolvingId === e.id}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                      >
                        {resolvingId === e.id ? 'Resolving…' : 'Mark resolved'}
                      </button>
                      <button
                        onClick={() => setNoteId(null)}
                        className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Resolved ({resolved.length})</h2>
          <div className="space-y-2 opacity-60">
            {resolved.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800 capitalize">{e.type.replace(/_/g, ' ')}</p>
                    {e.reason && <p className="text-xs text-slate-500 mt-0.5">{e.reason}</p>}
                    {e.human_note && (
                      <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded p-2">{e.human_note}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">{new Date(e.created_at).toLocaleString()}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">resolved</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!escalations.length && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">No escalations — the AI is handling everything.</p>
        </div>
      )}
    </div>
  );
}
