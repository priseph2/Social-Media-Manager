'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { API_URL as API } from '@/lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_COLORS: Record<string, string> = {
  escalation: 'bg-red-100 text-red-700',
  approval_pending: 'bg-amber-100 text-amber-700',
  job_failed: 'bg-red-100 text-red-600',
  info: 'bg-blue-100 text-blue-700',
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    const res = await fetch(`${API}/api/notifications`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setNotifications((await res.json()).notifications || []);
  }, []);

  const markRead = async (id: string) => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    await fetch(`${API}/api/notifications/${id}/read`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    await fetch(`${API}/api/notifications/read-all`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-800">
              Notifications {unreadCount > 0 && <span className="ml-1 text-xs text-slate-400">({unreadCount} unread)</span>}
            </span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-slate-400">No notifications yet.</p>
                <p className="text-xs text-slate-300 mt-1">Escalations and approvals appear here.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const badge = TYPE_COLORS[n.type] || TYPE_COLORS.info;
                const inner = (
                  <div className={`px-4 py-3 transition-colors ${!n.read ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-start gap-2">
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 ${badge}`}>
                        {n.type.replace(/_/g, ' ')}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-sm leading-snug ${!n.read ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                          {n.title}
                        </p>
                        {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </div>
                );
                return (
                  <div key={n.id} onClick={() => markRead(n.id)} className="cursor-pointer">
                    {n.link ? <Link href={n.link}>{inner}</Link> : inner}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
