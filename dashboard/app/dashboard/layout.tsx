import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { SidebarNav } from '@/components/sidebar-nav';
import { AppShell } from '@/components/app-shell';
import { NotificationBell } from '@/components/notification-bell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenantId = (user.app_metadata as { tenant_id?: string })?.tenant_id;
  if (!tenantId) redirect('/onboarding');

  // Fetch pending content approvals count for sidebar badge
  const { count: pendingApprovals } = await supabase
    .from('content_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .then((r) => ({ count: r.count ?? 0 }));

  const sidebar = (
    <>
      <div className="px-5 py-5 border-b border-slate-200 hidden lg:flex items-center justify-between">
        <span className="font-bold text-slate-900 text-sm">AI Social Manager</span>
        <NotificationBell />
      </div>
      <SidebarNav pendingApprovals={pendingApprovals} />
      <div className="px-4 py-4 border-t border-slate-200">
        <p className="text-xs text-slate-400 truncate mb-2">{user.email}</p>
        <LogoutButton />
      </div>
    </>
  );

  const mobileHeader = (
    <span className="font-bold text-slate-900 text-sm">AI Social Manager</span>
  );

  return (
    <AppShell sidebar={sidebar} mobileHeader={mobileHeader}>
      {children}
    </AppShell>
  );
}
