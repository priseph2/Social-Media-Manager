'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface ContentItem {
  id: string;
  platform: string | null;
  content_type: string | null;
  scheduled_at: string;
  status: 'scheduled' | 'posted' | 'failed' | 'cancelled';
  content: string | null;
  posted_at: string | null;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const PLATFORM_BADGE: Record<string, string> = {
  twitter: 'bg-sky-100 text-sky-700',
  instagram: 'bg-pink-100 text-pink-700',
  linkedin: 'bg-blue-100 text-blue-700',
  facebook: 'bg-blue-600 text-white',
};

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  posted: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

const STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-blue-400',
  posted: 'bg-emerald-500',
  failed: 'bg-red-500',
  cancelled: 'bg-slate-300',
};

function platformBadgeClass(platform: string | null) {
  return PLATFORM_BADGE[platform ?? ''] || 'bg-slate-100 text-slate-600';
}

function statusBadgeClass(status: string) {
  return STATUS_BADGE[status] || 'bg-slate-100 text-slate-600';
}

function statusDotClass(status: string) {
  return STATUS_DOT[status] || 'bg-slate-300';
}

// ── Calendar grid helpers ─────────────────────────────────────────────────────

function buildCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];
  for (let i = 0; i < startDow; i++) {
    cells.push({ date: new Date(year, month, i - startDow + 1), isCurrentMonth: false });
  }
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getTime() + 86400000), isCurrentMonth: false });
  }
  return cells;
}

function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const fetchCalendar = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const res = await fetch(`${API}/api/content/calendar?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setItems(json.items || []);
      }
    } catch {
      // silent — keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendar(year, month);
    setSelectedKey(null);
  }, [year, month, fetchCalendar]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  // Group items by date key
  const byDate = items.reduce((acc, item) => {
    const key = item.scheduled_at.slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, ContentItem[]>);

  const cells = buildCells(year, month);
  const todayKey = dateKey(today);
  const selectedItems = selectedKey ? (byDate[selectedKey] || []) : [];

  return (
    <div className="p-4 sm:p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Content Calendar</h1>
        <p className="text-sm text-slate-500 mt-0.5">Browse scheduled and published posts by month.</p>
      </div>

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
        {/* ── Calendar card ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Month navigation */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <button
              onClick={prevMonth}
              className="text-sm font-medium text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              ← Prev
            </button>
            <h2 className="text-base font-semibold text-slate-900">
              {MONTH_NAMES[month]} {year}
            </h2>
            <button
              onClick={nextMonth}
              className="text-sm font-medium text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Next →
            </button>
          </div>

          {/* Day-of-week labels */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {DOW_LABELS.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Loading overlay */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <svg className="animate-spin h-6 w-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}

          {/* Grid */}
          {!loading && (
            <>
              <div className="grid grid-cols-7 divide-x divide-slate-100">
                {cells.map((cell, idx) => {
                  const key = dateKey(cell.date);
                  const dayItems = byDate[key] || [];
                  const isToday = key === todayKey;
                  const isSelected = key === selectedKey;
                  const overflow = dayItems.length > 3 ? dayItems.length - 3 : 0;

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedKey(isSelected ? null : key)}
                      className={[
                        'min-h-[90px] p-1.5 border-b border-slate-100 cursor-pointer transition-colors',
                        !cell.isCurrentMonth ? 'bg-slate-50' : 'bg-white',
                        isSelected ? 'ring-2 ring-inset ring-indigo-400' : 'hover:bg-indigo-50/40',
                      ].join(' ')}
                    >
                      {/* Day number */}
                      <div className="flex justify-end mb-1">
                        <span
                          className={[
                            'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium',
                            isToday
                              ? 'bg-indigo-600 text-white'
                              : cell.isCurrentMonth
                                ? 'text-slate-700'
                                : 'text-slate-300',
                          ].join(' ')}
                        >
                          {cell.date.getDate()}
                        </span>
                      </div>

                      {/* Item dots */}
                      <div className="space-y-0.5">
                        {dayItems.slice(0, 3).map((item) => (
                          <div key={item.id} className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass(item.status)}`} />
                            <span className="text-[10px] text-slate-600 truncate leading-tight">
                              {(item.platform || 'post').slice(0, 6)}
                            </span>
                          </div>
                        ))}
                        {overflow > 0 && (
                          <span className="text-[10px] text-slate-400 pl-2.5">+{overflow} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Empty state */}
              {items.length === 0 && (
                <div className="py-10 px-6 text-center border-t border-slate-100">
                  <p className="text-sm text-slate-500">No content scheduled for this month.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Use the content generator to create and schedule posts.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Selected day panel ── */}
        <div className="mt-4 lg:mt-0">
          {selectedKey && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {new Date(selectedKey + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </h3>
                <button
                  onClick={() => setSelectedKey(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {selectedItems.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-slate-400">No posts scheduled for this day.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                  {selectedItems.map((item) => (
                    <div key={item.id} className="px-5 py-4">
                      {/* Badges row */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {item.platform && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${platformBadgeClass(item.platform)}`}>
                            {item.platform}
                          </span>
                        )}
                        {item.content_type && (
                          <span className="text-xs text-slate-500 capitalize">
                            {item.content_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ml-auto ${statusBadgeClass(item.status)}`}>
                          {item.status}
                        </span>
                      </div>

                      {/* Scheduled time */}
                      <p className="text-xs text-slate-400 mb-2">
                        {new Date(item.scheduled_at).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })}
                        {item.posted_at && (
                          <span className="ml-2 text-emerald-600">
                            · Posted {new Date(item.posted_at).toLocaleTimeString('en-US', {
                              hour: 'numeric', minute: '2-digit', hour12: true,
                            })}
                          </span>
                        )}
                      </p>

                      {/* Content preview */}
                      {item.content && (
                        <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg px-3 py-2 line-clamp-3 whitespace-pre-wrap">
                          {item.content.slice(0, 120)}{item.content.length > 120 ? '…' : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!selectedKey && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-8 text-center">
              <p className="text-sm text-slate-400">Click a day to see its scheduled content.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
