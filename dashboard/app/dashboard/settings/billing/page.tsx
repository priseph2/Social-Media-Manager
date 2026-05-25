'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { apiRequest } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanConfig {
  name: string;
  priceUSD: number;
  priceNGN: number;
  limits: { maxBrands: number | null; monthlyAiOps: number | null };
  features: Record<string, boolean>;
}

interface Subscription {
  plan: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: string | null;
}

interface UsageData {
  billingPeriod: string;
  totalOps: number;
  opsLimit: number | null;
  remainingOps: number | null;
  totalCostUsd: number;
}

interface BillingPlan {
  subscription: Subscription;
  planConfig: PlanConfig;
  usage: UsageData;
}

interface PlanOption {
  id: string;
  name: string;
  priceUSD: number;
  priceNGN: number;
  limits: { maxBrands: number | null; monthlyAiOps: number | null };
  features: Record<string, boolean>;
}

interface SkillBreakdown {
  skill: string;
  ops: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

// ── Feature labels ────────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<string, string> = {
  socialScheduling: 'Social Scheduling',
  brandGuardian: 'Brand Guardian',
  customerService: 'AI Customer Service',
  basicAnalytics: 'Analytics Dashboard',
  emailCampaigns: 'Email Campaigns',
  ecommerceOptimizer: 'E-commerce Optimizer',
  advancedAnalytics: 'Advanced Analytics',
  ga4: 'Google Analytics 4',
  forecasting: 'Performance Forecasting',
  contentCalendar: 'Content Calendar',
  whiteLabel: 'White Label',
  customReporting: 'Custom Reports',
  prioritySupport: 'Priority Support',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [billing, setBilling] = useState<BillingPlan | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [breakdown, setBreakdown] = useState<SkillBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const verifyAttempted = useRef(false);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const [billingData, plansData, usageData] = await Promise.all([
        apiRequest<BillingPlan>('/api/billing/plan', session.access_token),
        apiRequest<{ plans: PlanOption[] }>('/api/billing/plans', session.access_token),
        apiRequest<{ breakdown: SkillBreakdown[] }>('/api/billing/usage', session.access_token),
      ]);
      setBilling(billingData);
      setPlans(plansData.plans);
      setBreakdown(usageData.breakdown || []);
    } catch (e) {
      setError('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();

    // If redirected back from Paystack with a reference, verify the payment (once only)
    const reference = searchParams.get('trxref') || searchParams.get('reference');
    // Paystack references are alphanumeric; reject anything that doesn't match to prevent forged verifications
    const isValidRef = reference && /^[a-zA-Z0-9_\-]{8,100}$/.test(reference);
    if (searchParams.get('payment') === 'verify' && isValidRef && !verifyAttempted.current) {
      verifyAttempted.current = true;
      verifyPayment(reference);
    }
  }, [load, searchParams]);

  async function verifyPayment(reference: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      await apiRequest('/api/billing/verify', session.access_token, {
        method: 'POST',
        body: JSON.stringify({ reference }),
      });
      setSuccess('Payment verified! Your plan has been activated.');
      await load();
      // Clean URL
      router.replace('/dashboard/settings/billing');
    } catch (e) {
      setError('Payment verification failed. Contact support if you were charged.');
    }
  }

  async function handleCheckout(planId: string, currency: 'NGN' | 'USD') {
    setActionLoading(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const data = await apiRequest<{ authorizationUrl: string; reference: string }>(
        '/api/billing/checkout',
        session.access_token,
        { method: 'POST', body: JSON.stringify({ plan: planId, currency }) }
      );
      // Redirect to Paystack hosted checkout
      window.location.href = data.authorizationUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setActionLoading(false);
    }
  }

  async function handleCancelSubscription() {
    if (!confirm('Cancel your subscription? It will remain active until the end of your billing period.')) return;
    setActionLoading(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      await apiRequest('/api/billing/subscription', session.access_token, { method: 'DELETE' });
      setSuccess('Subscription will be cancelled at the end of your billing period.');
      await load();
    } catch (e) {
      setError('Failed to cancel subscription');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="p-4 sm:p-8 text-slate-400 text-sm">Loading billing info…</div>;

  const currentPlan = billing?.subscription.plan || 'free';
  const isFree = currentPlan === 'free';
  const opsUsed = billing?.usage.totalOps || 0;
  const opsLimit = billing?.usage.opsLimit;
  const opsPercent = opsLimit ? Math.min(100, Math.round((opsUsed / opsLimit) * 100)) : 0;
  const isTrialing = billing?.subscription.status === 'trialing';

  return (
    <div className="p-4 sm:p-8 max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Billing & Plan</h1>

      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{success}</div>}

      {/* Free plan upgrade banner */}
      {isFree && (
        <div className="mb-6 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-indigo-900 mb-1">You're on the Free plan</p>
              <p className="text-xs text-indigo-700">
                {opsLimit
                  ? `${opsUsed} of ${opsLimit} ops used this month. Upgrade to unlock 500+ ops, email campaigns, analytics, and more.`
                  : 'Upgrade to unlock email campaigns, advanced analytics, customer service AI, and more.'}
              </p>
            </div>
            <span className="shrink-0 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium">
              Free
            </span>
          </div>
          {opsLimit && (
            <div className="mt-3">
              <div className="w-full bg-indigo-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${opsPercent > 85 ? 'bg-red-500' : opsPercent > 60 ? 'bg-amber-500' : 'bg-indigo-600'}`}
                  style={{ width: `${opsPercent}%` }}
                />
              </div>
              <p className="text-xs text-indigo-600 mt-1">{Math.max(0, (opsLimit ?? 0) - opsUsed)} ops remaining this month</p>
            </div>
          )}
        </div>
      )}

      {/* Current Plan Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold text-slate-900 capitalize">{currentPlan} Plan</h2>
              {!isFree && <StatusBadge status={billing?.subscription.status || 'active'} />}
            </div>
            {isTrialing && billing?.subscription.trialEndsAt && (
              <p className="text-sm text-amber-600">
                Trial ends {new Date(billing.subscription.trialEndsAt).toLocaleDateString()}
              </p>
            )}
            {billing?.subscription.currentPeriodEnd && !isTrialing && (
              <p className="text-xs text-slate-500">
                {billing.subscription.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} on{' '}
                {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            {billing?.subscription.pendingPlan && (
              <p className="text-xs text-indigo-600 mt-1">
                Switching to {billing.subscription.pendingPlan} next cycle
              </p>
            )}
          </div>
          <div className="text-right">
            {isFree ? (
              <p className="text-2xl font-bold text-slate-900">Free</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-900">
                  ${billing?.planConfig.priceUSD}<span className="text-sm font-normal text-slate-500">/mo</span>
                </p>
                <p className="text-xs text-slate-400">₦{billing?.planConfig.priceNGN?.toLocaleString()}/mo</p>
              </>
            )}
          </div>
        </div>

        {/* Usage Meter */}
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">AI Operations this month</span>
            <span className="text-sm text-slate-600">
              {opsUsed.toLocaleString()}{opsLimit ? ` / ${opsLimit.toLocaleString()}` : ' (unlimited)'}
            </span>
          </div>
          {opsLimit && (
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${opsPercent > 85 ? 'bg-red-500' : opsPercent > 60 ? 'bg-amber-500' : 'bg-indigo-600'}`}
                style={{ width: `${opsPercent}%` }}
              />
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-400">Estimated cost: ${billing?.usage.totalCostUsd?.toFixed(4)}</span>
            {opsLimit && (
              <span className="text-xs text-slate-400">{billing?.usage.remainingOps?.toLocaleString()} remaining</span>
            )}
          </div>
        </div>

        {/* Per-skill breakdown */}
        {breakdown.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Usage by skill</p>
            <div className="space-y-1.5">
              {breakdown.slice(0, 5).map((row) => (
                <div key={row.skill} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 capitalize">{row.skill?.replace(/-/g, ' ')}</span>
                  <span className="text-slate-500">{row.ops} ops · ${row.costUsd.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Plan Selector — only show paid plans */}
      <h2 className="text-sm font-semibold text-slate-700 mb-3">
        {isFree ? 'Upgrade to unlock your full potential' : 'Change plan'}
      </h2>
      <div className="grid gap-4 mb-8">
        {plans.filter((p) => p.id !== 'free').map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div
              key={plan.id}
              className={`bg-white rounded-xl border p-5 transition-all ${isCurrent ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-800">{plan.name}</span>
                    {isCurrent && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Current</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    <FeatureChip label={plan.limits.maxBrands ? `${plan.limits.maxBrands} brand${plan.limits.maxBrands > 1 ? 's' : ''}` : 'Unlimited brands'} />
                    <FeatureChip label={plan.limits.monthlyAiOps ? `${plan.limits.monthlyAiOps.toLocaleString()} ops/mo` : 'Unlimited ops'} />
                    {Object.entries(FEATURE_LABELS).filter(([k]) => plan.features[k]).slice(0, 4).map(([k, v]) => (
                      <FeatureChip key={k} label={v} />
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-lg font-bold text-slate-900">${plan.priceUSD}<span className="text-xs font-normal text-slate-500">/mo</span></p>
                  <p className="text-xs text-slate-400 mb-2">₦{plan.priceNGN.toLocaleString()}</p>
                  {!isCurrent && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleCheckout(plan.id, 'NGN')}
                        disabled={actionLoading}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                      >
                        Pay ₦
                      </button>
                      <button
                        onClick={() => handleCheckout(plan.id, 'USD')}
                        disabled={actionLoading}
                        className="text-xs border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg hover:border-slate-400 disabled:opacity-60 transition-colors"
                      >
                        Pay $
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Danger zone — only for paying subscribers */}
      {!isFree && billing?.subscription.status === 'active' && !billing.subscription.cancelAtPeriodEnd && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Cancel subscription</h2>
          <p className="text-xs text-slate-500 mb-3">
            Your subscription will remain active until the end of your current billing period.
            You will move to the Free plan after cancellation.
          </p>
          <button
            onClick={handleCancelSubscription}
            disabled={actionLoading}
            className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-60"
          >
            Cancel subscription
          </button>
        </div>
      )}

      {billing?.subscription.cancelAtPeriodEnd && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          Your subscription is scheduled to cancel on{' '}
          {billing.subscription.currentPeriodEnd
            ? new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()
            : 'the end of the billing period'}.
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trialing: 'bg-indigo-100 text-indigo-700',
    past_due: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  const labels: Record<string, string> = {
    active: 'Active',
    trialing: 'Trial',
    past_due: 'Past due',
    cancelled: 'Cancelled',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] || 'bg-slate-100 text-slate-500'}`}>
      {labels[status] || status}
    </span>
  );
}

function FeatureChip({ label }: { label: string }) {
  return (
    <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
      {label}
    </span>
  );
}
