'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

import { API_URL as API } from '@/lib/api';

interface AdminUser {
  id: string;
  email: string;
  role: string | null;
  tenantId: string | null;
  tenant: { id: string; name: string; plan: string; status: string } | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  isBanned: boolean;
}

const PLAN_COLORS: Record<string, string> = {
  free:    'bg-slate-100 text-slate-600',
  starter: 'bg-sky-100 text-sky-700',
  growth:  'bg-indigo-100 text-indigo-700',
  agency:  'bg-violet-100 text-violet-700',
};

function timeAgo(iso: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'admins' | 'no_tenant' | 'banned'>('all');
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const getToken = async () => {
    const { data: { session } } = await createClient().auth.getSession();
    return session?.access_token || '';
  };

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    const res = await fetch(`${API}/api/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    } else {
      const { error: e } = await res.json().catch(() => ({ error: 'Failed to load users' }));
      setError(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (userId: string, body: object, label: string) => {
    setActing((p) => ({ ...p, [userId]: true }));
    const token = await getToken();
    const res = await fetch(`${API}/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setActing((p) => ({ ...p, [userId]: false }));
    if (res.ok) {
      setFeedback((p) => ({ ...p, [userId]: label }));
      setTimeout(() => setFeedback((p) => ({ ...p, [userId]: '' })), 2500);
      load();
    } else {
      const { error: e } = await res.json().catch(() => ({ error: 'Action failed' }));
      setFeedback((p) => ({ ...p, [userId]: `Error: ${e}` }));
      setTimeout(() => setFeedback((p) => ({ ...p, [userId]: '' })), 3000);
    }
  };

  const filtered = users.filter((u) => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase())
      || u.tenant?.name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ? true :
      filter === 'admins' ? u.role === 'super_admin' :
      filter === 'no_tenant' ? !u.tenantId :
      filter === 'banned' ? u.isBanned : true;
    return matchSearch && matchFilter;
  });

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-slate-500">
      <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
      Loading users…
    </div>
  );

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        <strong>Failed to load users:</strong> {error}
        <p className="mt-1 text-xs text-red-500">Ensure the Supabase service role key is configured on the backend.</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-8 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} total registered accounts</p>
        </div>
        <button
          onClick={load}
          className="text-xs font-medium text-rose-600 hover:text-rose-800 flex items-center gap-1.5 border border-rose-200 px-3 py-1.5 rounded-lg"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by email or tenant name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {([
            { id: 'all', label: 'All' },
            { id: 'admins', label: 'Super Admins' },
            { id: 'no_tenant', label: 'No Tenant' },
            { id: 'banned', label: 'Banned' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                filter === f.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Users', value: total },
          { label: 'Super Admins', value: users.filter((u) => u.role === 'super_admin').length },
          { label: 'No Tenant', value: users.filter((u) => !u.tenantId).length },
          { label: 'Banned', value: users.filter((u) => u.isBanned).length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className="text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">No users match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Tenant</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((u) => (
                  <tr key={u.id} className={`hover:bg-slate-50 group ${u.isBanned ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          u.role === 'super_admin' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {(u.email[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{u.email}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {!u.emailConfirmed && (
                              <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">unverified</span>
                            )}
                            {u.isBanned && (
                              <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded">banned</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.tenant ? (
                        <Link href={`/admin/tenants/${u.tenantId}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                          {u.tenant.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-xs">No tenant</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.tenant?.plan ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[u.tenant.plan] || 'bg-slate-100 text-slate-600'}`}>
                          {u.tenant.plan}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {u.role === 'super_admin' ? (
                        <span className="text-xs px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full font-semibold">
                          Super Admin
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">User</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{timeAgo(u.lastSignInAt)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {feedback[u.id] ? (
                        <span className={`text-xs font-medium ${feedback[u.id].startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
                          {feedback[u.id]}
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {acting[u.id] ? (
                            <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              {u.role !== 'super_admin' ? (
                                <button
                                  onClick={() => act(u.id, { role: 'super_admin' }, '✓ Admin granted')}
                                  className="text-xs text-slate-500 hover:text-rose-700 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                                  title="Grant super admin"
                                >
                                  Grant Admin
                                </button>
                              ) : (
                                <button
                                  onClick={() => act(u.id, { role: null }, '✓ Admin revoked')}
                                  className="text-xs text-slate-500 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-50 transition-colors"
                                  title="Revoke super admin"
                                >
                                  Revoke Admin
                                </button>
                              )}
                              {!u.isBanned ? (
                                <button
                                  onClick={() => act(u.id, { ban: true }, '✓ User banned')}
                                  className="text-xs text-slate-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                  title="Ban user"
                                >
                                  Ban
                                </button>
                              ) : (
                                <button
                                  onClick={() => act(u.id, { ban: false }, '✓ User unbanned')}
                                  className="text-xs text-slate-500 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
                                  title="Unban user"
                                >
                                  Unban
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-3 text-right">Showing {filtered.length} of {total} users</p>
    </div>
  );
}
