'use client';

import { useState } from 'react';

const FAQS = [
  {
    q: 'What is Aria and how does it work?',
    a: "Aria is an AI-powered marketing platform with eight specialised agents: content generation, social publishing, brand review, customer service, e-commerce optimisation, email campaigns, analytics, and image generation. You connect your accounts once, set your brand guidelines, and Aria's agents run continuously in the background — generating content, engaging with customers, and reporting on performance.",
  },
  {
    q: 'Do I need technical knowledge to use Aria?',
    a: "Not at all. Aria is designed for business owners and marketing teams, not developers. The onboarding wizard walks you through connecting your social accounts, defining your brand voice, and selecting your platforms in under 10 minutes. No code required.",
  },
  {
    q: 'Which social media platforms does Aria support?',
    a: 'Aria supports Instagram, Facebook, TikTok, Twitter/X, LinkedIn, Pinterest, and WhatsApp. Content is published natively to Meta platforms and TikTok. Buffer is used as a fallback for other platforms.',
  },
  {
    q: 'What AI model powers Aria?',
    a: "Aria is built on Claude by Anthropic — one of the most capable and safety-focused AI models available. This means your generated content is high-quality, contextually accurate, and free from harmful outputs. We use Claude Sonnet for content generation and Claude Haiku for real-time tasks like brand review and customer replies.",
  },
  {
    q: 'Can I review content before it publishes?',
    a: "Yes. Enable the Content Approval Gate in your brand settings and all AI-generated content will be held in a review queue before going live. You can approve, reject with feedback, or set a quality threshold above which content auto-approves. You stay in full control.",
  },
  {
    q: 'How does billing work?',
    a: 'Aria uses monthly subscription billing through Paystack, supporting both Naira (NGN) and USD. You can upgrade, downgrade, or cancel at any time from your billing settings. Cancellations take effect at the end of your billing period and your account moves to the Free plan automatically.',
  },
  {
    q: 'Is my data secure?',
    a: "Yes. All data is encrypted in transit (TLS) and at rest. We use Supabase PostgreSQL with row-level security, which means each business's data is completely isolated from other tenants — even at the database level. Credentials and API keys are stored encrypted, never in plain text.",
  },
  {
    q: 'Do you offer a refund?',
    a: "We offer a 7-day refund policy on your first payment if Aria doesn't meet your expectations. After that, we do not issue refunds for completed billing periods — but you can cancel at any time to stop future charges.",
  },
];

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="divide-y divide-slate-100">
      {FAQS.map((faq, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-4 py-5 text-left group"
          >
            <span className="text-base font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
              {faq.q}
            </span>
            <svg
              className={`shrink-0 w-5 h-5 text-indigo-500 transition-transform duration-200 ${
                open === i ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open === i && (
            <p className="text-slate-600 text-sm leading-relaxed pb-5 pr-8">{faq.a}</p>
          )}
        </div>
      ))}
    </div>
  );
}
