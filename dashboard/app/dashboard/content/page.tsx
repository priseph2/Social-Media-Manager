import { createClient } from '@/lib/supabase/server';

export default async function ContentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantId = (user?.app_metadata as { tenant_id?: string })?.tenant_id;

  const { data: posts } = tenantId
    ? await supabase.from('content_schedule').select('*').eq('tenant_id', tenantId).order('scheduled_at', { ascending: false }).limit(20)
    : { data: [] };

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Content</h1>

      {!posts?.length ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-slate-400 text-sm">No content scheduled yet.</p>
          <p className="text-slate-400 text-xs mt-1">Content appears here once the AI generates and schedules posts.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Platform</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Scheduled</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {posts.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 capitalize text-slate-700">{p.platform}</td>
                  <td className="px-5 py-3 text-slate-500">{String(p.content_type ?? '').replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3 text-slate-500">{new Date(p.scheduled_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.status === 'posted' ? 'bg-green-100 text-green-700' :
                      p.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
