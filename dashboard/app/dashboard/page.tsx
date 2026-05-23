import { createClient } from '@/lib/supabase/server';

export default async function OverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = (user?.app_metadata as { tenant_id?: string })?.tenant_id;

  const [{ data: escalations }, { data: tasks }, { data: scheduled }] = await Promise.all([
    tenantId
      ? supabase.from('escalations').select('id,type,reason,created_at').eq('tenant_id', tenantId).eq('resolved', false).order('created_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
    tenantId
      ? supabase.from('task_log').select('id,skill,action,status,created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] }),
    tenantId
      ? supabase.from('content_schedule').select('id,platform,content_type,scheduled_at,status').eq('tenant_id', tenantId).order('scheduled_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ]);

  const openEscalations = escalations?.length ?? 0;
  const completedTasks = tasks?.filter((t) => t.status === 'completed').length ?? 0;

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Overview</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Open Escalations" value={String(openEscalations)} warning={openEscalations > 0} />
        <StatCard label="Tasks Completed" value={String(completedTasks)} />
        <StatCard label="Scheduled Posts" value={String(scheduled?.length ?? 0)} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Section title="Open Escalations">
          {openEscalations === 0 ? (
            <EmptyState text="No open escalations" />
          ) : (
            <ul className="space-y-2">
              {escalations?.map((e) => (
                <li key={e.id} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <div>
                    <p className="text-sm font-medium text-slate-800 capitalize">{String(e.type).replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-500">{e.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent Activity">
          {!tasks?.length ? (
            <EmptyState text="No activity yet" />
          ) : (
            <ul className="space-y-1">
              {tasks?.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className="text-sm text-slate-700">{t.skill}</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span className="text-xs text-slate-500">{t.action}</span>
                  </div>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function StatCard({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${warning ? 'border-amber-200' : 'border-slate-200'}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${warning ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-slate-400 py-4 text-center">{text}</p>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    escalated: 'bg-amber-100 text-amber-700',
    pending: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? colors.pending}`}>
      {status}
    </span>
  );
}
