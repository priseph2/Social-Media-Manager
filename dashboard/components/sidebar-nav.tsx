'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const settingsNav = [
  { href: '/dashboard/settings/brand', label: 'Brand' },
  { href: '/dashboard/settings/integrations', label: 'Integrations' },
  { href: '/dashboard/settings/billing', label: 'Billing' },
  { href: '/dashboard/settings/security', label: 'Security' },
];

function NavLink({ href, label, pathname, badge }: { href: string; label: string; pathname: string; badge?: number }) {
  const isActive = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
        isActive
          ? 'bg-indigo-50 text-indigo-700 font-medium'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export function SidebarNav({ pendingApprovals = 0 }: { pendingApprovals?: number }) {
  const pathname = usePathname();

  const mainNav = [
    { href: '/dashboard', label: 'Overview' },
    { href: '/dashboard/content', label: 'Content' },
    { href: '/dashboard/content/approvals', label: 'Approvals', badge: pendingApprovals },
    { href: '/dashboard/content/calendar', label: 'Calendar' },
    { href: '/dashboard/escalations', label: 'Escalations' },
    { href: '/dashboard/analytics', label: 'Analytics' },
  ];

  return (
    <nav className="flex-1 px-3 py-4 flex flex-col gap-6">
      <div className="space-y-0.5">
        {mainNav.map((item) => (
          <NavLink key={item.href} {...item} pathname={pathname} />
        ))}
      </div>
      <div>
        <p className="px-3 mb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Settings
        </p>
        <div className="space-y-0.5">
          {settingsNav.map((item) => (
            <NavLink key={item.href} {...item} pathname={pathname} />
          ))}
        </div>
      </div>
    </nav>
  );
}
