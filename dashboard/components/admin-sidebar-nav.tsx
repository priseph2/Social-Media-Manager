'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const adminNav = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/tenants', label: 'Tenants' },
  { href: '/admin/jobs', label: 'Job Queues' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/usage', label: 'Usage' },
  { href: '/admin/integrations', label: 'Integrations' },
];

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const isActive = href === '/admin' ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
        isActive
          ? 'bg-rose-50 text-rose-700 font-medium'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
    </Link>
  );
}

export function AdminSidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 px-3 py-4">
      <div className="space-y-0.5">
        {adminNav.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}
