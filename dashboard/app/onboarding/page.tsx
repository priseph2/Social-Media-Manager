'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiRequest } from '@/lib/api';
import { useRouter } from 'next/navigation';

type Step = 'company' | 'brand_voice' | 'audience' | 'integrations' | 'launch';
const STEPS: Step[] = ['company', 'brand_voice', 'audience', 'integrations', 'launch'];
const STEP_LABELS: Record<Step, string> = {
  company: 'Company', brand_voice: 'Brand Voice', audience: 'Audience',
  integrations: 'Integrations', launch: 'Launch',
};

const PERSONALITY_OPTIONS = ['Sophisticated', 'Warm', 'Bold', 'Playful', 'Minimal', 'Educational', 'Exclusive', 'Approachable', 'Professional', 'Youthful'];
const INDUSTRY_OPTIONS = ['Luxury & Fashion', 'Beauty & Cosmetics', 'Food & Beverage', 'Health & Wellness', 'Technology', 'Finance', 'Real Estate', 'Retail', 'Education', 'Other'];
const CURRENCIES = ['USD', 'GBP', 'EUR', 'NGN', 'KES', 'GHS', 'ZAR', 'CAD', 'AUD'];

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState<Step>('company');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const tenantId = (session?.user?.app_metadata as { tenant_id?: string })?.tenant_id;
      if (tenantId) router.replace('/dashboard');
    });
  }, []);

  const [company, setCompany] = useState({ name: '', tagline: '', industry: '', market: '', website: '', currency: 'USD' });
  const [voice, setVoice] = useState({ tone: '', personality: [] as string[], doList: '', dontList: '' });
  const [audience, setAudience] = useState({ primary: '', secondary: '' });

  const currentIndex = STEPS.indexOf(step);

  async function next() {
    setError('');
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      if (step === 'company') {
        if (!company.name) throw new Error('Brand name is required');
        const hasTenant = (session.user.app_metadata as { tenant_id?: string })?.tenant_id;
        if (!hasTenant) {
          const slug = company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          await apiRequest('/api/tenants/setup', session.access_token, {
            method: 'POST',
            body: JSON.stringify({ name: company.name, slug }),
          });
          await supabase.auth.refreshSession();
        }
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s) await apiRequest('/api/tenants/me/onboarding/company', s.access_token, { method: 'PUT', body: JSON.stringify(company) });
      }

      if (step === 'brand_voice') {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s) throw new Error('Not authenticated');
        const brandConfig = {
          identity: { name: company.name, tagline: company.tagline, markets: company.market ? [company.market] : [], positioning: company.industry },
          voice: {
            tone: voice.tone,
            personality: voice.personality,
            doList: voice.doList.split('\n').map((l) => l.trim()).filter(Boolean),
            dontList: voice.dontList.split('\n').map((l) => l.trim()).filter(Boolean),
          },
          compliance: { pricing: `Prices in ${company.currency}` },
        };
        await Promise.all([
          apiRequest('/api/tenants/me/brand-config', s.access_token, { method: 'PUT', body: JSON.stringify(brandConfig) }),
          apiRequest('/api/tenants/me/onboarding/voice', s.access_token, { method: 'PUT', body: JSON.stringify(voice) }),
        ]);
      }

      if (step === 'audience') {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s) throw new Error('Not authenticated');
        await apiRequest('/api/tenants/me/onboarding/audience', s.access_token, { method: 'PUT', body: JSON.stringify(audience) });
      }

      if (step === 'integrations') {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s) throw new Error('Not authenticated');
        await apiRequest('/api/tenants/me/onboarding/platforms', s.access_token, { method: 'PUT', body: JSON.stringify({}) });
      }

      if (step === 'launch') {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s) throw new Error('Not authenticated');
        await apiRequest('/api/tenants/me/onboarding/launch', s.access_token, { method: 'PUT', body: JSON.stringify({}) });
        router.push('/dashboard');
        return;
      }

      setStep(STEPS[currentIndex + 1]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function togglePersonality(trait: string) {
    setVoice((v) => ({
      ...v,
      personality: v.personality.includes(trait) ? v.personality.filter((t) => t !== trait) : [...v.personality, trait],
    }));
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Progress bar */}
        <div className="flex gap-1 mb-8">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= currentIndex ? 'bg-indigo-600' : 'bg-slate-200'}`} />
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-1">
            Step {currentIndex + 1} of {STEPS.length}
          </p>

          {/* STEP: Company */}
          {step === 'company' && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Tell us about your brand</h2>
              <p className="text-slate-500 text-sm mb-6">This gives the AI your business context.</p>
              <div className="space-y-4">
                <Field label="Brand name *">
                  <input type="text" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} className={inputCls} placeholder="e.g. Acme Fashion" />
                </Field>
                <Field label="Tagline">
                  <input type="text" value={company.tagline} onChange={(e) => setCompany({ ...company, tagline: e.target.value })} className={inputCls} placeholder="e.g. Style for every story" />
                </Field>
                <Field label="Industry">
                  <select value={company.industry} onChange={(e) => setCompany({ ...company, industry: e.target.value })} className={inputCls}>
                    <option value="">Select industry</option>
                    {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Primary market">
                    <input type="text" value={company.market} onChange={(e) => setCompany({ ...company, market: e.target.value })} className={inputCls} placeholder="e.g. Nigeria" />
                  </Field>
                  <Field label="Currency">
                    <select value={company.currency} onChange={(e) => setCompany({ ...company, currency: e.target.value })} className={inputCls}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Website">
                  <input type="url" value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} className={inputCls} placeholder="https://yoursite.com" />
                </Field>
              </div>
            </div>
          )}

          {/* STEP: Brand Voice */}
          {step === 'brand_voice' && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Define your brand voice</h2>
              <p className="text-slate-500 text-sm mb-6">Every piece of content will be shaped by this.</p>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Personality traits</label>
                  <div className="flex flex-wrap gap-2">
                    {PERSONALITY_OPTIONS.map((trait) => (
                      <button key={trait} type="button" onClick={() => togglePersonality(trait)}
                        className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${voice.personality.includes(trait) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400'}`}>
                        {trait}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label="Tone description">
                  <textarea value={voice.tone} onChange={(e) => setVoice({ ...voice, tone: e.target.value })} rows={3} className={inputCls} placeholder="e.g. Confident and warm. We speak as a trusted advisor, never a salesperson." />
                </Field>
                <Field label="We always DO (one per line)">
                  <textarea value={voice.doList} onChange={(e) => setVoice({ ...voice, doList: e.target.value })} rows={3} className={inputCls} placeholder={"Use sensory language\nSpeak directly to the reader\nCreate desire through storytelling"} />
                </Field>
                <Field label="We NEVER do (one per line)">
                  <textarea value={voice.dontList} onChange={(e) => setVoice({ ...voice, dontList: e.target.value })} rows={3} className={inputCls} placeholder={"Use aggressive CTAs\nMake unsubstantiated claims\nUse all-caps for emphasis"} />
                </Field>
              </div>
            </div>
          )}

          {/* STEP: Audience */}
          {step === 'audience' && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Who are your customers?</h2>
              <p className="text-slate-500 text-sm mb-6">The AI tailors every post to your audience.</p>
              <div className="space-y-4">
                <Field label="Primary audience">
                  <textarea value={audience.primary} onChange={(e) => setAudience({ ...audience, primary: e.target.value })} rows={3} className={inputCls} placeholder="e.g. Professionals aged 28-45, brand-conscious, value quality over price." />
                </Field>
                <Field label="Secondary audience (optional)">
                  <textarea value={audience.secondary} onChange={(e) => setAudience({ ...audience, secondary: e.target.value })} rows={2} className={inputCls} placeholder="e.g. Gifters buying for special occasions." />
                </Field>
              </div>
            </div>
          )}

          {/* STEP: Integrations */}
          {step === 'integrations' && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">Connect your platforms</h2>
              <p className="text-slate-500 text-sm mb-6">Skip this for now — connect everything in Settings later.</p>
              <div className="space-y-3">
                {[
                  { name: 'Buffer', desc: 'Social scheduling' },
                  { name: 'Mailchimp', desc: 'Email marketing' },
                  { name: 'Shopify / WooCommerce', desc: 'E-commerce' },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.desc}</p>
                    </div>
                    <span className="text-xs text-slate-400">Optional</span>
                  </div>
                ))}
                <p className="text-xs text-slate-400 text-center pt-1">Connect in Settings → Integrations after setup.</p>
              </div>
            </div>
          )}

          {/* STEP: Launch */}
          {step === 'launch' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🚀</div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Ready to launch</h2>
              <p className="text-slate-500 text-sm mb-6">
                {company.name || 'Your brand'} is configured. The AI will start working immediately.
              </p>
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 text-left mb-2">
                <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">What happens next</p>
                <ul className="text-sm text-slate-600 space-y-1.5">
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span> Daily content generation at 8 AM</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span> Brand Guardian reviews every post</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span> Escalations appear in your dashboard</li>
                  <li className="flex items-start gap-2"><span className="text-green-500">✓</span> Weekly newsletter every Sunday</li>
                </ul>
              </div>
            </div>
          )}

          {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

          <div className="flex justify-between mt-8">
            <button type="button" onClick={() => currentIndex > 0 && setStep(STEPS[currentIndex - 1])} disabled={currentIndex === 0} className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-0 transition-colors">
              ← Back
            </button>
            <button type="button" onClick={next} disabled={loading} className="bg-indigo-600 text-white text-sm px-6 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors font-medium">
              {loading ? 'Saving…' : step === 'launch' ? 'Launch →' : 'Continue →'}
            </button>
          </div>
        </div>

        <div className="flex justify-center gap-4 mt-4">
          {STEPS.map((s, i) => (
            <span key={s} className={`text-xs ${i === currentIndex ? 'text-indigo-600 font-medium' : i < currentIndex ? 'text-slate-400' : 'text-slate-300'}`}>
              {STEP_LABELS[s]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
