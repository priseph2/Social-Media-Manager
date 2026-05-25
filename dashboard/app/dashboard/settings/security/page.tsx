'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SecuritySettingsPage() {
  const supabase = createClient();

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Email state
  const [newEmail, setNewEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return; }
    if (newPassword !== confirmPassword) { setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) setPwMsg({ type: 'error', text: error.message });
    else { setPwMsg({ type: 'success', text: 'Password updated successfully.' }); setNewPassword(''); setConfirmPassword(''); }
  };

  const updateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg(null);
    if (!newEmail || !newEmail.includes('@')) { setEmailMsg({ type: 'error', text: 'Please enter a valid email.' }); return; }
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setEmailSaving(false);
    if (error) setEmailMsg({ type: 'error', text: error.message });
    else { setEmailMsg({ type: 'success', text: `Confirmation link sent to ${newEmail}. Check your inbox.` }); setNewEmail(''); }
  };

  return (
    <div className="p-4 sm:p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Security</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your password and email address.</p>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Change Password</h2>
        <form onSubmit={updatePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm pr-10 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Confirm New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{pwMsg.text}</p>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={pwSaving || !newPassword || !confirmPassword}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors">
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Change Email */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Update Email Address</h2>
        <form onSubmit={updateEmail} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">New Email Address</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <p className="text-xs text-slate-400 mt-1">A confirmation link will be sent to your new address.</p>
          </div>
          {emailMsg && (
            <p className={`text-sm ${emailMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{emailMsg.text}</p>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={emailSaving || !newEmail}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-40 transition-colors">
              {emailSaving ? 'Sending…' : 'Send Confirmation'}
            </button>
          </div>
        </form>
      </div>

      {/* Info card */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-700 mb-1">Security notice</p>
        <p className="text-xs text-slate-500">Updating your password will not automatically invalidate existing sessions on other devices. If you suspect unauthorised access, contact <a href="mailto:hello@aria.ai" className="text-indigo-600 hover:text-indigo-800">support</a> immediately.</p>
      </div>
    </div>
  );
}
