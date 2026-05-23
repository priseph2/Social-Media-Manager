'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function logout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="w-full text-left text-xs text-slate-500 hover:text-slate-700 transition-colors"
    >
      Sign out
    </button>
  );
}
