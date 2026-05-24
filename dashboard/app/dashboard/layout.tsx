import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { SidebarNav } from '@/components/sidebar-nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenantId = (user.app_metadata as { tenant_id?: string })?.tenant_id;
  if (!tenantId) redirect('/onboarding');

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-slate-200">
          <span className="font-bold text-slate-900 text-sm">AI Social Manager</span>
        </div>
        <SidebarNav />
        <div className="px-4 py-4 border-t border-slate-200">
          <p className="text-xs text-slate-400 truncate mb-2">{user.email}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

