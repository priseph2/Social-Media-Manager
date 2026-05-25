'use client';

import Link from 'next/link';
import { useState } from 'react';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    desc: 'Try Aria and see the value',
    priceUSD: 0,
    priceNGN: 0,
    highlight: false,
    badge: null,
    limits: '30 AI ops/month · 1 brand',
    features: [
      'Social post scheduling',
      'Brand Guardian (AI review)',
      'Content calendar',
      'Email support',
    ],
    cta: 'Get Started Free',
    href: '/signup',
  },
  {
    id: 'starter',
    name: 'Starter',
    desc: 'Everything you need to grow',
    priceUSD: 49,
    priceNGN: 75_000,
    highlight: false,
    badge: null,
    limits: '500 AI ops/month · 1 brand · 30 images/mo',
    features: [
      'Everything in Free',
      'Customer service automation',
      'Basic analytics',
      '30 AI-generated images/month',
      'Priority email support',
    ],
    cta: 'Start Starter',
    href: '/signup',
  },
  {
    id: 'growth',
    name: 'Growth',
    desc: 'Scale your marketing engine',
    priceUSD: 149,
    priceNGN: 225_000,
    highlight: true,
    badge: 'Most Popular',
    limits: '2,000 AI ops/month · 3 brands · 150 images/mo',
    features: [
      'Everything in Starter',
      'Email campaigns (Mailchimp)',
      'E-commerce optimizer',
      'Advanced analytics + GA4',
      'Predictive forecasting',
      '150 AI-generated images/month',
    ],
    cta: 'Start Growth',
    href: '/signup',
  },
  {
    id: 'agency',
    name: 'Agency',
    desc: 'For agencies managing many brands',
    priceUSD: 399,
    priceNGN: 600_000,
    highlight: false,
    badge: null,
    limits: 'Unlimited ops · Unlimited brands',
    features: [
      'Everything in Growth',
      'Unlimited AI ops + images',
      'White-label dashboard',
      'Custom reporting',
      'Priority support + SLA',
      'Dedicated account manager',
    ],
    cta: 'Contact Sales',
    href: '/signup',
  },
];

function formatPrice(n: number, currency: 'USD' | 'NGN') {
  if (n === 0) return 'Free';
  if (currency === 'NGN') return `₦${n.toLocaleString()}`;
  return `$${n}`;
}

export function PricingSection() {
  const [currency, setCurrency] = useState<'USD' | 'NGN'>('NGN');

  return (
    <section id="pricing" className="py-24 bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto mb-8">
            Start free, upgrade when you&apos;re ready. No hidden fees, no surprises.
          </p>
          <div className="inline-flex items-center bg-slate-800 rounded-xl p-1 gap-1">
            <button
              onClick={() => setCurrency('NGN')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                currency === 'NGN'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              NGN ₦
            </button>
            <button
              onClick={() => setCurrency('USD')}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                currency === 'USD'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              USD $
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl p-6 flex flex-col ${
                plan.highlight
                  ? 'bg-indigo-600 ring-2 ring-indigo-400 shadow-2xl shadow-indigo-900/50 scale-[1.02]'
                  : 'bg-slate-800 border border-slate-700'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <span className="bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                <p className={`text-sm mb-5 ${plan.highlight ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {plan.desc}
                </p>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-extrabold text-white">
                    {formatPrice(currency === 'USD' ? plan.priceUSD : plan.priceNGN, currency)}
                  </span>
                  {(currency === 'USD' ? plan.priceUSD : plan.priceNGN) > 0 && (
                    <span className={`text-sm ${plan.highlight ? 'text-indigo-200' : 'text-slate-400'}`}>
                      /mo
                    </span>
                  )}
                </div>
                <p className={`text-xs ${plan.highlight ? 'text-indigo-200' : 'text-slate-500'}`}>
                  {plan.limits}
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <svg
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        plan.highlight ? 'text-indigo-200' : 'text-indigo-400'
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span
                      className={`text-sm ${plan.highlight ? 'text-indigo-100' : 'text-slate-300'}`}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`block text-center text-sm font-bold py-3.5 rounded-xl transition-all ${
                  plan.highlight
                    ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="text-center text-slate-500 text-sm mt-10">
          All plans include a 7-day money-back guarantee · Cancel anytime
        </p>
      </div>
    </section>
  );
}
