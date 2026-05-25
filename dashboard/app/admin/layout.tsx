import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AdminSidebarNav } from '@/components/admin-sidebar-nav';
import { AppShell } from '@/components/app-shell';
import { LogoutButton } from '@/components/logout-button';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const role = (user.app_metadata as { role?: string })?.role;
  if (role !== 'super_admin') redirect('/dashboard');

  const sidebar = (
    <>
      <div className="px-5 py-4 border-b border-slate-200 hidden lg:block">
        <div className="inline-flex items-center px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-xs font-bold uppercase tracking-wider">
          Super Admin
        </div>
        <p className="text-xs text-slate-400 mt-2 truncate">{user.email}</p>
      </div>
      <AdminSidebarNav />
      <div className="px-4 py-4 border-t border-slate-200 space-y-2">
        <Link href="/" className="block text-xs text-slate-500 hover:text-slate-800 transition-colors">
          ← Homepage
        </Link>
        <Link href="/dashboard" className="block text-xs text-slate-500 hover:text-slate-800 transition-colors">
          ← Back to Dashboard
        </Link>
        <div className="pt-1 border-t border-slate-100">
          <LogoutButton />
        </div>
      </div>
    </>
  );

  const mobileHeader = (
    <div className="inline-flex items-center px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-xs font-bold uppercase tracking-wider">
      Super Admin
    </div>
  );

  return (
    <AppShell sidebar={sidebar} mobileHeader={mobileHeader}>
      {children}
    </AppShell>
  );
}
