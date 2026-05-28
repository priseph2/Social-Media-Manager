'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

import { API_URL as API, timedFetch } from '@/lib/api';

interface SuspiciousUser {
  id: string;
  email: string;
  createdAt: string;
  emailConfirmed: boolean;
  isBanned: boolean;
  reason: string;
}

interface BlocklistEntry {
  id: string;
  value: string;
  type: 'ip' | 'domain' | 'email';
  reason: string;
  created_by: string;
  created_at: string;
}

const REASON_BADGE: Record<string, string> = {
  'Unconfirmed > 7 days': 'bg-amber-100 text-amber-700',
  'Disposable email domain': 'bg-red-100 text-red-700',
};

const TYPE_BADGE: Record<string, string> = {
  ip: 'bg-slate-100 text-slate-600',
  domain: 'bg-amber-100 text-amber-700',
  email: 'bg-red-100 text-red-700',
};

export default function SecurityPage() {
  const [tab, setTab] = useState<'suspicious' | 'blocklist'>('suspicious');

  // Suspicious users state
  const [suspicious, setSuspicious] = useState<SuspiciousUser[]>([]);
  const [suspiciousLoading, setSuspiciousLoading] = useState(true);
  const [suspiciousError, setSuspiciousError] = useState<string | null>(null);

  // Blocklist state
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [blocklistLoading, setBlocklistLoading] = useState(true);
  const [blocklistError, setBlocklistError] = useState<string | null>(null);

  // Add form state
  const [addValue, setAddValue] = useState('');
  const [addType, setAddType] = useState<'ip' | 'domain' | 'email'>('ip');
  const [addReason, setAddReason] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addFeedback, setAddFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadSuspicious = useCallback(async () => {
    setSuspiciousLoading(true);
    setSuspiciousError(null);
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) return;
      const res = await timedFetch(`${API}/api/admin/security/suspicious`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setSuspicious(json.suspicious ?? []);
    } catch (err) {
      setSuspiciousError(err instanceof Error ? err.message : 'Failed to load suspicious users');
    } finally {
      setSuspiciousLoading(false);
    }
  }, []);

  const loadBlocklist = useCallback(async () => {
    setBlocklistLoading(true);
    setBlocklistError(null);
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) return;
      const res = await timedFetch(`${API}/api/admin/security/blocklist`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setBlocklist(json.blocklist ?? []);
    } catch (err) {
      setBlocklistError(err instanceof Error ? err.message : 'Failed to load blocklist');
    } finally {
      setBlocklistLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuspicious();
    loadBlocklist();
  }, [loadSuspicious, loadBlocklist]);

  const banUser = async (userId: string) => {
    const { data: { session } } = await createClient().auth.getSession();
    await timedFetch(`${API}/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session!.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ban: true }),
    });
    loadSuspicious();
  };

  const addToBlocklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addValue.trim() || !addReason.trim()) return;
    setAddLoading(true);
    setAddFeedback(null);
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await timedFetch(`${API}/api/admin/security/blocklist`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: addValue.trim(), type: addType, reason: addReason.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAddFeedback({ type: 'success', message: 'Entry added to blocklist.' });
      setAddValue('');
      setAddReason('');
      loadBlocklist();
    } catch (err) {
      setAddFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add entry' });
    } finally {
      setAddLoading(false);
    }
  };

  const deleteBlocklistEntry = async (id: string) => {
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) return;
      const res = await timedFetch(`${API}/api/admin/security/blocklist/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      loadBlocklist();
    } catch (err) {
      setBlocklistError(err instanceof Error ? err.message : 'Failed to delete entry');
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Security</h1>
        <p className="text-sm text-slate-500 mt-0.5">Monitor suspicious accounts and manage IP/domain blocklist</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <button
          onClick={() => setTab('suspicious')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px ${
            tab === 'suspicious'
              ? 'bg-white border border-b-white border-slate-200 text-rose-700'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Suspicious Users
          {suspicious.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
              {suspicious.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('blocklist')}
          className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px ${
            tab === 'blocklist'
              ? 'bg-white border border-b-white border-slate-200 text-rose-700'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          IP Blocklist
          {blocklist.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
              {blocklist.length}
            </span>
          )}
        </button>
      </div>

      {/* Suspicious Users Tab */}
      {tab === 'suspicious' && (
        <div>
          {suspiciousLoading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : suspiciousError ? (
            <div className="text-sm text-red-600">{suspiciousError}</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {!suspicious.length ? (
                <div className="px-5 py-12 text-center text-sm text-slate-400">
                  No suspicious accounts detected.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-5 py-3 font-medium">User</th>
                      <th className="px-5 py-3 font-medium">Reason</th>
                      <th className="px-5 py-3 font-medium">Created</th>
                      <th className="px-5 py-3 font-medium">Confirmed</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {suspicious.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0 uppercase">
                              {user.email.charAt(0)}
                            </div>
                            <span className="text-slate-800">{user.email}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              REASON_BADGE[user.reason] || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {user.reason}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-500 text-xs">
                          {new Date(user.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-5 py-3">
                          {user.emailConfirmed ? (
                            <span className="text-xs text-emerald-600 font-medium">Yes</span>
                          ) : (
                            <span className="text-xs text-amber-600 font-medium">No</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {user.isBanned ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                              Banned
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {user.isBanned ? (
                            <span className="text-xs text-slate-400">Already banned</span>
                          ) : (
                            <button
                              onClick={() => banUser(user.id)}
                              className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                              Ban
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* IP Blocklist Tab */}
      {tab === 'blocklist' && (
        <div className="space-y-6">
          {/* Add form */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Add to Blocklist</h2>
            <form onSubmit={addToBlocklist} className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs text-slate-500 mb-1">Value (IP / domain / email)</label>
                <input
                  type="text"
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                  placeholder="e.g. 1.2.3.4 or example.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Type</label>
                <select
                  value={addType}
                  onChange={(e) => setAddType(e.target.value as 'ip' | 'domain' | 'email')}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200"
                >
                  <option value="ip">IP</option>
                  <option value="domain">Domain</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs text-slate-500 mb-1">Reason</label>
                <input
                  type="text"
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value)}
                  placeholder="e.g. Spam source"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-200"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={addLoading}
                className="px-4 py-2 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {addLoading ? 'Adding…' : 'Add'}
              </button>
            </form>
            {addFeedback && (
              <p
                className={`mt-3 text-xs ${
                  addFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {addFeedback.message}
              </p>
            )}
          </div>

          {/* Blocklist table */}
          {blocklistLoading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : blocklistError ? (
            <div className="text-sm text-red-600">{blocklistError}</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {!blocklist.length ? (
                <div className="px-5 py-12 text-center text-sm text-slate-400">
                  No blocked IPs or domains.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-5 py-3 font-medium">Value</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Reason</th>
                      <th className="px-5 py-3 font-medium">Added By</th>
                      <th className="px-5 py-3 font-medium">Date</th>
                      <th className="px-5 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {blocklist.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-xs text-slate-800">{entry.value}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                              TYPE_BADGE[entry.type] || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{entry.reason}</td>
                        <td className="px-5 py-3 text-slate-500 text-xs">{entry.created_by}</td>
                        <td className="px-5 py-3 text-slate-500 text-xs">
                          {new Date(entry.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => deleteBlocklistEntry(entry.id)}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
