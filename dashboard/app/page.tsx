import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { LandingNav } from '@/components/landing-nav';
import { FaqAccordion } from '@/components/faq-accordion';
import { PricingSection } from '@/components/pricing-section';

export const metadata: Metadata = {
  title: 'Aria — AI Marketing Platform for Growing Businesses',
  description:
    'Aria is an AI-powered social media manager, content generator, customer service agent, and e-commerce optimizer — all in one platform. Priced in Naira.',
};

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    title: 'AI Content Engine',
    desc: 'Generate platform-native posts, email campaigns, product listings, and blog articles in seconds. Every output reviewed for brand consistency before it publishes.',
    accent: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Smart Scheduling',
    desc: 'Publish to Instagram, Facebook, TikTok, Twitter, LinkedIn, Pinterest, and WhatsApp — natively, at the right time, with no manual posting.',
    accent: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Brand Guardian',
    desc: "Every post scored against your brand guidelines before it goes live. Set a quality threshold — content above it auto-approves, below it waits for your review.",
    accent: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: 'Customer Service AI',
    desc: "Respond to DMs, comments, and support tickets 24/7. The AI handles routine queries automatically and escalates to you only when a human touch is needed.",
    accent: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
    title: 'E-Commerce Optimizer',
    desc: 'Connects to Shopify, WooCommerce, BigCommerce, and Wix. Rewrites product listings, monitors competitor pricing, and forecasts demand shifts.',
    accent: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Email Campaigns',
    desc: 'AI-designed nurture sequences, promotional blasts, and newsletters — personalised by segment and sent through Mailchimp on a smart schedule.',
    accent: 'text-pink-400',
    bg: 'bg-pink-500/10 border-pink-500/20',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Analytics & Forecasting',
    desc: 'Deep-dive reporting with GA4 integration. Predictive analytics surface upcoming trends and revenue opportunities before your competitors notice them.',
    accent: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    title: 'AI Image Generation',
    desc: "Create scroll-stopping visuals using Imagen4, DALL-E, and Canva — automatically briefed from your content calendar, sized for each platform.",
    accent: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
  },
];

const BLOG_POSTS = [
  {
    tag: 'Strategy',
    title: 'How African SMEs Are Using AI to Compete with Global Brands',
    excerpt:
      'The playing field has shifted. Small businesses with the right AI tools are now out-publishing, out-engaging, and out-converting brands that spend 100× more on marketing.',
    date: 'May 20, 2025',
    readTime: '6 min read',
  },
  {
    tag: 'Tutorial',
    title: 'The Complete Guide to AI Content Calendars for Social Media in 2025',
    excerpt:
      "Consistent posting is the single highest-leverage marketing activity for most small businesses. Here's how to automate it without losing your brand voice.",
    date: 'May 14, 2025',
    readTime: '8 min read',
  },
  {
    tag: 'Product',
    title: 'Why Your Brand Needs a Content Approval Workflow Before You Scale',
    excerpt:
      'One off-brand post can undo months of trust-building. A structured approval gate lets you move fast without the brand risk — here is how to set one up.',
    date: 'May 8, 2025',
    readTime: '5 min read',
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <div className="bg-slate-950 text-white">
      <LandingNav />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-indigo-950/50 to-slate-950" />
        <div className="absolute top-1/3 -left-20 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-20 w-[400px] h-[400px] bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/25 rounded-full px-4 py-1.5 text-indigo-300 text-sm font-medium mb-8">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                Now with native TikTok &amp; Instagram publishing
              </div>

              <h1 className="text-5xl sm:text-6xl font-extrabold leading-[1.1] tracking-tight mb-6">
                Your AI Marketing Team,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400">
                  Ready 24/7
                </span>
              </h1>

              <p className="text-slate-400 text-xl leading-relaxed mb-10 max-w-lg">
                Aria handles content creation, social publishing, customer service, and
                e-commerce optimisation — so you can focus on building your business.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg shadow-indigo-900/40"
                >
                  Start for free
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all"
                >
                  See the features
                </a>
              </div>

              <p className="text-slate-500 text-sm">
                Free forever · No credit card required · Priced in Naira
              </p>
            </div>

            {/* Dashboard mockup */}
            <div className="hidden lg:block">
              <div className="relative">
                <div className="absolute -inset-4 bg-indigo-500/5 rounded-3xl blur-2xl" />
                <div className="relative bg-slate-800/70 border border-slate-700/60 rounded-2xl overflow-hidden backdrop-blur-sm shadow-2xl">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/60 bg-slate-900/50">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    <span className="text-slate-500 text-xs ml-3 font-mono">aria — content generator</span>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-xl px-4 py-3 flex items-center gap-2.5">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                      <span className="text-indigo-300 text-sm font-mono">
                        Generating post for @acmebrand · Instagram
                      </span>
                    </div>

                    <div className="space-y-2.5 px-1">
                      <div className="h-3 bg-slate-700 rounded-full w-full" />
                      <div className="h-3 bg-slate-700 rounded-full w-11/12" />
                      <div className="h-3 bg-slate-700 rounded-full w-4/5" />
                      <div className="h-3 bg-slate-600/50 rounded-full w-2/3" />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {[
                        ['Instagram', 'bg-pink-500/20 text-pink-400 border-pink-500/20'],
                        ['Facebook', 'bg-blue-500/20 text-blue-400 border-blue-500/20'],
                        ['TikTok', 'bg-slate-700/60 text-slate-300 border-slate-600/40'],
                        ['LinkedIn', 'bg-violet-500/20 text-violet-400 border-violet-500/20'],
                      ].map(([label, cls]) => (
                        <span
                          key={label}
                          className={`text-xs px-2.5 py-1 rounded-md border font-medium ${cls}`}
                        >
                          {label}
                        </span>
                      ))}
                    </div>

                    <div className="border-t border-slate-700/60 pt-4 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                        <span className="text-emerald-400 text-sm font-semibold">Brand score: 94 / 100</span>
                      </div>
                      <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                        Approve &amp; Publish
                      </button>
                    </div>

                    <div className="bg-slate-900/70 rounded-xl p-4 border border-slate-700/40">
                      <p className="text-slate-400 text-xs mb-3 font-semibold uppercase tracking-wide">
                        This week
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          ['Reach', '12.4K', '+18%'],
                          ['Engagement', '3.2K', '+24%'],
                          ['Conversions', '89', '+11%'],
                        ].map(([label, val, change]) => (
                          <div key={label}>
                            <p className="text-slate-500 text-xs mb-0.5">{label}</p>
                            <p className="text-white text-sm font-bold">{val}</p>
                            <p className="text-emerald-400 text-xs font-medium">{change}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof strip ──────────────────────────────────────────────── */}
      <div className="border-y border-slate-800 bg-slate-900/50 py-5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-slate-500 text-sm">
            {['Instagram', 'Facebook', 'TikTok', 'Twitter / X', 'LinkedIn', 'Pinterest', 'WhatsApp'].map((p) => (
              <span key={p} className="font-medium">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Everything your marketing team does,
              <br className="hidden sm:block" /> powered by AI
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">
              Eight specialised AI agents work together continuously, each an expert in their domain.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-slate-50 rounded-2xl p-6 border border-slate-100 hover:border-indigo-200 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div
                  className={`w-10 h-10 ${f.bg} border rounded-xl flex items-center justify-center mb-4 ${f.accent}`}
                >
                  {f.icon}
                </div>
                <h3 className="text-slate-900 font-bold mb-2 text-sm">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── About ───────────────────────────────────────────────────────────── */}
      <section id="about" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6">
                Built for businesses that move fast
              </h2>
              <p className="text-slate-600 text-lg leading-relaxed mb-6">
                Aria was born from a simple frustration: why does consistent, high-quality
                marketing cost so much when most of the work is repetitive? We built Aria to
                give growing businesses — especially across Africa — the same marketing leverage
                as companies with 10-person teams.
              </p>
              <p className="text-slate-600 text-lg leading-relaxed mb-10">
                Every feature is designed around real workflows: not just content that gets
                generated, but content that passes your brand standards, gets approved by the
                right person, and actually publishes — while your AI handles the replies.
              </p>
              <div className="grid grid-cols-3 gap-6 pt-4 border-t border-slate-200">
                {[
                  { stat: '8', label: 'AI agents' },
                  { stat: '7+', label: 'Platforms' },
                  { stat: '4', label: 'E-commerce connectors' },
                ].map(({ stat, label }) => (
                  <div key={label} className="text-center">
                    <p className="text-4xl font-extrabold text-indigo-600 mb-1">{stat}</p>
                    <p className="text-slate-500 text-sm">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {[
                {
                  title: 'AI-native, not AI-bolted-on',
                  desc: 'Every workflow was designed with AI from day one. Automation feels natural because it was built that way — not retrofitted onto a manual process.',
                  emoji: '🧠',
                },
                {
                  title: 'African businesses first',
                  desc: 'Pricing in Naira, Paystack billing, and features calibrated to the platforms and workflows that matter in African markets.',
                  emoji: '🌍',
                },
                {
                  title: 'You stay in control',
                  desc: 'Automation handles the volume. You make the calls that matter — with a human-in-the-loop approval gate for every post if you want it.',
                  emoji: '🎛️',
                },
              ].map((v) => (
                <div
                  key={v.title}
                  className="bg-white rounded-2xl p-6 border border-slate-200 flex items-start gap-4 hover:border-indigo-200 transition-colors"
                >
                  <span className="text-2xl mt-0.5">{v.emoji}</span>
                  <div>
                    <h3 className="text-slate-900 font-bold mb-1">{v.title}</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">{v.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <PricingSection />

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Frequently asked questions
            </h2>
            <p className="text-slate-500 text-lg">
              Everything you need to know before you get started.
            </p>
          </div>

          <FaqAccordion />

          <div className="mt-12 text-center bg-slate-50 rounded-2xl p-8 border border-slate-200">
            <p className="text-slate-800 font-semibold mb-2">Still have questions?</p>
            <p className="text-slate-500 text-sm mb-5">
              Our team is happy to walk you through anything.
            </p>
            <a
              href="mailto:hello@tryaria.ai"
              className="inline-flex items-center gap-2 text-indigo-600 font-semibold hover:text-indigo-700 transition-colors text-sm"
            >
              Contact support
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Blog ────────────────────────────────────────────────────────────── */}
      <section id="blog" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-12 gap-4">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
                From the blog
              </h2>
              <p className="text-slate-500 text-lg">
                Practical guides on AI marketing for growing businesses.
              </p>
            </div>
            <Link
              href="/blog"
              className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm flex items-center gap-1.5 shrink-0 transition-colors"
            >
              View all articles
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {BLOG_POSTS.map((post) => (
              <article
                key={post.title}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-indigo-200 hover:-translate-y-1 transition-all group cursor-pointer"
              >
                <div className="h-44 bg-gradient-to-br from-indigo-50 via-violet-50 to-slate-50 flex items-center justify-center">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-slate-100">
                    <svg
                      className="w-6 h-6 text-indigo-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                      />
                    </svg>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                      {post.tag}
                    </span>
                    <span className="text-slate-400 text-xs">{post.readTime}</span>
                  </div>
                  <h3 className="text-slate-900 font-bold text-base leading-snug mb-2 group-hover:text-indigo-700 transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-slate-500 text-sm leading-relaxed mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <p className="text-slate-400 text-xs">{post.date}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────────────── */}
      <section className="py-20 bg-indigo-600 relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-violet-600/30 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to put your marketing on autopilot?
          </h2>
          <p className="text-indigo-200 text-lg mb-10 max-w-xl mx-auto">
            Join businesses that have replaced hours of manual marketing work with
            Aria&apos;s AI agents.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg"
            >
              Get started for free
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center justify-center gap-2 border-2 border-indigo-400 hover:border-white text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors"
            >
              View pricing
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-950 border-t border-slate-800/60 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-14">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-black text-sm">A</span>
                </div>
                <span className="text-white font-bold text-lg tracking-tight">Aria</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-[200px]">
                AI-powered marketing for growing businesses. Built for Africa.
              </p>
            </div>

            {[
              {
                heading: 'Product',
                links: [
                  ['Features', '#features'],
                  ['Pricing', '#pricing'],
                  ['Blog', '#blog'],
                  ['Changelog', '#'],
                ],
              },
              {
                heading: 'Company',
                links: [
                  ['About', '#about'],
                  ['Careers', '#'],
                  ['Contact', 'mailto:hello@tryaria.ai'],
                  ['Status', '#'],
                ],
              },
              {
                heading: 'Legal',
                links: [
                  ['Privacy Policy', '#'],
                  ['Terms of Service', '#'],
                  ['Cookie Policy', '#'],
                  ['Data Processing', '#'],
                ],
              },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <p className="text-white font-semibold text-sm mb-4">{heading}</p>
                <ul className="space-y-2.5">
                  {links.map(([label, href]) => (
                    <li key={label}>
                      <a
                        href={href}
                        className="text-slate-400 hover:text-white text-sm transition-colors"
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm">
              © 2025 Aria Technologies. All rights reserved.
            </p>
            <div className="flex items-center gap-5">
              <a href="#" aria-label="Twitter / X" className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href="#" aria-label="LinkedIn" className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              <a href="#" aria-label="Instagram" className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
