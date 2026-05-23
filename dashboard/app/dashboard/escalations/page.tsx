import { createClient } from '@/lib/supabase/server';

export default async function EscalationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = (user?.app_metadata as { tenant_id?: string })?.tenant_id;

  const { data: escalations } = tenantId
    ? await supabase.from('escalations').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50)
    : { data: [] };

  const open = escalations?.filter((e) => !e.resolved) ?? [];
  const resolved = escalations?.filter((e) => e.resolved) ?? [];

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Escalations</h1>

      {open.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-amber-700 mb-3">Open ({open.length})</h2>
          <div className="space-y-3">
            {open.map((e) => <EscalationCard key={e.id} escalation={e} />)}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 mb-3">Resolved ({resolved.length})</h2>
          <div className="space-y-2 opacity-60">
            {resolved.map((e) => <EscalationCard key={e.id} escalation={e} />)}
          </div>
        </div>
      )}

      {!escalations?.length && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">No escalations — the AI is handling everything.</p>
        </div>
      )}
    </div>
  );
}

function EscalationCard({ escalation }: { escalation: Record<string, unknown> }) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${!escalation.resolved ? 'border-amber-200' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800 capitalize">
            {String(escalation.type ?? '').replace(/_/g, ' ')}
          </p>
          {escalation.reason && <p className="text-xs text-slate-500 mt-0.5">{String(escalation.reason)}</p>}
          {escalation.skill && (
            <p className="text-xs text-slate-400 mt-1">Skill: {String(escalation.skill)}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          escalation.resolved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {escalation.resolved ? 'resolved' : 'open'}
        </span>
      </div>
      {escalation.human_note && (
        <p className="mt-3 text-xs text-slate-600 bg-slate-50 rounded p-2">{String(escalation.human_note)}</p>
      )}
      <p className="text-xs text-slate-400 mt-3">
        {new Date(String(escalation.created_at)).toLocaleString()}
      </p>
    </div>
  );
}
