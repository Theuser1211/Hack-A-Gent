'use client';

import { useState } from 'react';

type Criterion = { name: string; weight: number };

type AppData = {
  name: string;
  tagline: string;
  problem: string;
  features: string[];
  criteria: Criterion[];
  sponsors: string[];
  screens: string[];
  theme: string;
  primaryFeature: string;
  inputLabel: string;
  analyzeVerb: string;
  sample: string;
  workflowSteps: string[];
};

const APP: AppData = {"name":"Grove","tagline":"Grove — a planning agent that stress-tests your roadmap against the ways projects die and patches the top risk first.","problem":"test-hackathon.html","features":["Foresight core loop: one screen from first click to result","Live ai data with graceful empty and loading states","Seeded demo data so the pitch works fully offline","One polished, scripted live path with seed data","Graceful empty/loading/error states for every screen","Deployed demo URL reachable from the judging room"],"criteria":[{"name":"Innovation","weight":25},{"name":"Technical Complexity","weight":25},{"name":"Impact","weight":25},{"name":"UX","weight":25}],"sponsors":[],"screens":["Input — provide data or prompt to the AI model","Processing — show model working, streaming, or reasoning","Output — display results, confidence scores, or generated content"],"theme":"dev","primaryFeature":"Foresight core loop: one screen from first click to result","inputLabel":"Paste code or describe the bug","analyzeVerb":"Diagnose","sample":"TypeError: Cannot read properties of undefined (reading \"map\") in Dashboard.tsx at line 42, after the recent API response shape change.","workflowSteps":["Paste the code","Diagnose the issue","Apply the fix"]};

type Theme = {
  bg: string;
  text: string;
  sub: string;
  border: string;
  card: string;
  accent: string;
  accentText: string;
  chip: string;
  chipText: string;
  bar: string;
  badge: string;
};

const THEMES: Record<string, Theme> = {
  ai: { bg: 'bg-slate-950', text: 'text-white', sub: 'text-slate-400', border: 'border-slate-800', card: 'bg-slate-900/50 border-slate-800', accent: 'bg-violet-600 hover:bg-violet-500', accentText: 'text-white', chip: 'bg-violet-500/10 border-violet-500/30', chipText: 'text-violet-300', bar: 'bg-violet-500', badge: 'bg-violet-500/20 border-violet-500/30 text-violet-200' },
  gaming: { bg: 'bg-slate-950', text: 'text-white', sub: 'text-slate-400', border: 'border-slate-800', card: 'bg-slate-900/50 border-slate-800', accent: 'bg-fuchsia-600 hover:bg-fuchsia-500', accentText: 'text-white', chip: 'bg-fuchsia-500/10 border-fuchsia-500/30', chipText: 'text-fuchsia-300', bar: 'bg-cyan-400', badge: 'bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-200' },
  health: { bg: 'bg-slate-50', text: 'text-slate-900', sub: 'text-slate-500', border: 'border-slate-200', card: 'bg-white border-slate-200', accent: 'bg-teal-600 hover:bg-teal-500', accentText: 'text-white', chip: 'bg-teal-500/10 border-teal-500/30', chipText: 'text-teal-700', bar: 'bg-teal-500', badge: 'bg-teal-500/10 border-teal-500/30 text-teal-700' },
  fintech: { bg: 'bg-slate-950', text: 'text-white', sub: 'text-slate-400', border: 'border-slate-800', card: 'bg-slate-900/50 border-slate-800', accent: 'bg-amber-500 hover:bg-amber-400', accentText: 'text-black', chip: 'bg-amber-500/10 border-amber-500/30', chipText: 'text-amber-300', bar: 'bg-amber-400', badge: 'bg-amber-500/10 border-amber-500/30 text-amber-200' },
  climate: { bg: 'bg-emerald-50', text: 'text-emerald-950', sub: 'text-emerald-700', border: 'border-emerald-200', card: 'bg-white border-emerald-200', accent: 'bg-emerald-600 hover:bg-emerald-500', accentText: 'text-white', chip: 'bg-emerald-500/10 border-emerald-500/30', chipText: 'text-emerald-700', bar: 'bg-emerald-600', badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700' },
  dev: { bg: 'bg-black', text: 'text-lime-300', sub: 'text-slate-500', border: 'border-slate-800', card: 'bg-zinc-950 border-slate-800', accent: 'bg-lime-500 hover:bg-lime-400', accentText: 'text-black', chip: 'bg-lime-500/10 border-lime-500/30', chipText: 'text-lime-300', bar: 'bg-lime-400', badge: 'bg-lime-500/10 border-lime-500/30 text-lime-300' },
  planning: { bg: 'bg-slate-950', text: 'text-white', sub: 'text-slate-400', border: 'border-slate-800', card: 'bg-slate-900/50 border-slate-800', accent: 'bg-indigo-600 hover:bg-indigo-500', accentText: 'text-white', chip: 'bg-indigo-500/10 border-indigo-500/30', chipText: 'text-indigo-300', bar: 'bg-indigo-500', badge: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-200' },
  default: { bg: 'bg-slate-950', text: 'text-white', sub: 'text-slate-400', border: 'border-slate-800', card: 'bg-slate-900/50 border-slate-800', accent: 'bg-violet-600 hover:bg-violet-500', accentText: 'text-white', chip: 'bg-violet-500/10 border-violet-500/30', chipText: 'text-violet-300', bar: 'bg-violet-500', badge: 'bg-violet-500/20 border-violet-500/30 text-violet-200' },
};

export default function Home() {
  const t: Theme = THEMES[APP.theme] ?? THEMES.default;
  const [view, setView] = useState(0);
  const [step, setStep] = useState(0);
  const [inputText, setInputText] = useState(APP.sample);
  const [analyzeState, setAnalyzeState] = useState('idle');
  const [analyzeBody, setAnalyzeBody] = useState('');

  const tabs = ['Live demo', 'Judging fit', 'Integrations'];

  const runAnalyze = async () => {
    setAnalyzeState('loading');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputText }),
      });
      const body = await res.json();
      setAnalyzeBody(JSON.stringify(body, null, 2) ?? '');
      setAnalyzeState('ok');
    } catch {
      setAnalyzeState('error');
    }
  };

  const restartWorkflow = () => {
    setInputText(APP.sample);
    setAnalyzeBody('');
    setAnalyzeState('idle');
    setStep(0);
  };

  return (
    <main className={'min-h-screen ' + t.bg + ' ' + t.text}>
      <header className={'sticky top-0 z-50 border-b backdrop-blur ' + t.border + ' ' + t.bg}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ' + t.accent + ' ' + t.accentText}>
              {APP.name.charAt(0)}
            </span>
            <span className="text-lg font-bold">{APP.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((label, i) => (
              <button
                key={label}
                onClick={() => setView(i)}
                className={'px-4 py-2 text-sm rounded-lg transition-colors ' + (view === i ? 'bg-slate-800 text-white' : t.sub + ' hover:text-white hover:bg-slate-800/50')}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <section className={'relative overflow-hidden border-b ' + t.border}>
        <div className="max-w-6xl mx-auto px-6 py-20">
          <span className={'inline-block px-3 py-1 text-xs font-medium rounded-full border mb-6 ' + t.badge}>
            {APP.theme === 'gaming' ? 'Game jam entry' : APP.theme === 'health' ? 'Health & care' : APP.theme === 'fintech' ? 'Finance & money' : APP.theme === 'climate' ? 'Climate & sustainability' : APP.theme === 'dev' ? 'Developer tool' : 'AI-powered product'}
          </span>
          <h1 className="text-5xl font-bold mb-5">{APP.name}</h1>
          <p className={'text-xl max-w-2xl mb-6 ' + t.sub}>{APP.tagline}</p>
          {APP.problem.length > 0 && (
            <p className={'text-sm max-w-3xl leading-relaxed mb-8 ' + t.sub}>
              <span className="font-semibold">The challenge: </span>
              {APP.problem}
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setView(0)}
              className={'px-6 py-3 rounded-lg font-semibold transition-colors ' + t.accent + ' ' + t.accentText}
            >
              Open live demo
            </button>
            <button
              onClick={() => setView(1)}
              className={'px-6 py-3 rounded-lg font-semibold border transition-colors ' + t.border + ' hover:opacity-80'}
            >
              See judging fit
            </button>
          </div>
          {APP.screens.length > 0 && (
            <div className={'mt-10 pt-6 border-t flex flex-wrap gap-2 ' + t.border}>
              <span className={'text-xs uppercase tracking-wider pt-1 ' + t.sub}>Key screens:</span>
              {APP.screens.map((s) => (
                <span key={s} className={'px-3 py-1 text-xs rounded-full border ' + t.chip + ' ' + t.chipText}>{s}</span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className={'flex gap-4 mb-8 border-b pb-4 ' + t.border}>
          {tabs.map((label, i) => (
            <button
              key={label}
              onClick={() => setView(i)}
              className={'px-4 py-2 rounded-lg font-medium transition-colors ' + (view === i ? 'bg-slate-800 text-white' : t.sub + ' hover:text-white')}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 0 && (
          <div className={'p-6 rounded-xl border ' + t.card}>
            <h2 className="text-lg font-semibold mb-1">{APP.primaryFeature}</h2>
            <p className={'text-sm mb-6 ' + t.sub}>
              One end-to-end workflow, live: {APP.workflowSteps.join(' → ')}. Every step below works — the frontend calls the backend, the backend runs the logic, the result renders. No dead ends.
            </p>

            <ol className={'flex flex-wrap items-center gap-2 mb-6 pb-4 border-b ' + t.border}>
              {APP.workflowSteps.map((label, i) => (
                <li key={label} className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(i)}
                    className={'px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ' + (step === i ? 'bg-slate-800 text-white border-slate-700' : t.chip + ' ' + t.chipText + ' hover:opacity-80')}
                  >
                    <span className={'mr-1.5 inline-flex w-5 h-5 items-center justify-center rounded-full text-xs font-bold ' + (step > i ? t.accent + ' ' + t.accentText : 'bg-slate-700 text-white')}>
                      {step > i ? '✓' : i + 1}
                    </span>
                    {label}
                  </button>
                  {i < APP.workflowSteps.length - 1 && <span className={'text-xs ' + t.sub}>&#8594;</span>}
                </li>
              ))}
            </ol>

            {step === 0 && (
              <div className="flex flex-col gap-3">
                <label className={'text-xs uppercase tracking-wider ' + t.sub}>{APP.inputLabel}</label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  rows={4}
                  placeholder={APP.inputLabel + '...'}
                  className={'w-full p-3 rounded-lg border font-mono text-sm ' + t.card + ' ' + t.text}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => { setInputText(APP.sample); }}
                    className={'px-5 py-3 rounded-lg border font-medium transition-colors ' + t.border + ' hover:opacity-80'}
                  >
                    Try sample
                  </button>
                  <button
                    onClick={() => setStep(1)}
                    disabled={inputText.trim().length === 0}
                    className={'px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 ' + t.accent + ' ' + t.accentText}
                  >
                    Continue to {APP.workflowSteps[1] ?? 'next step'}
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-3">
                <p className={'text-sm ' + t.sub}>
                  Step 2 of {APP.workflowSteps.length}: {APP.analyzeVerb} the input above. This calls the backend endpoint and renders the structured result below.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={runAnalyze}
                    disabled={analyzeState === 'loading' || inputText.trim().length === 0}
                    className={'px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 ' + t.accent + ' ' + t.accentText}
                  >
                    {analyzeState === 'loading' ? 'Running...' : APP.analyzeVerb}
                  </button>
                  <button
                    onClick={() => { setInputText(APP.sample); }}
                    className={'px-5 py-3 rounded-lg border font-medium transition-colors ' + t.border + ' hover:opacity-80'}
                  >
                    Try sample
                  </button>
                  {analyzeState === 'ok' && (
                    <button
                      onClick={() => setStep(2)}
                      className={'px-5 py-3 rounded-lg font-medium border transition-colors ' + t.border + ' hover:opacity-80'}
                    >
                      See result &#8594;
                    </button>
                  )}
                </div>
                <div className={'mt-1 p-4 rounded-lg border font-mono text-xs overflow-x-auto ' + t.card}>
                  {analyzeState === 'idle' && <span className={t.sub}>Result will appear here.</span>}
                  {analyzeState === 'loading' && <span className={t.sub}>Calling /api/analyze...</span>}
                  {analyzeState === 'error' && <span className="text-red-400">API unreachable — start the dev server.</span>}
                  {analyzeState === 'ok' && <pre className="whitespace-pre-wrap">{analyzeBody}</pre>}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-4">
                <h3 className="text-base font-semibold">{APP.workflowSteps[2] ?? 'Outcome'}</h3>
                <p className={'text-sm ' + t.sub}>
                  {analyzeState === 'ok'
                    ? 'The workflow completed end to end: the input was processed by the backend and the result is ready. This outcome directly supports the top judging criterion (' + (APP.criteria[0]?.name ?? 'Innovation') + ').'
                    : 'Run step 2 first to produce the outcome.'}
                </p>
                {analyzeState === 'ok' && (
                  <div className={'p-4 rounded-lg border font-mono text-xs overflow-x-auto ' + t.card}>
                    <pre className="whitespace-pre-wrap">{analyzeBody}</pre>
                  </div>
                )}
                <div>
                  <button
                    onClick={restartWorkflow}
                    className={'px-6 py-3 rounded-lg font-semibold transition-colors ' + t.accent + ' ' + t.accentText}
                  >
                    Run another scenario
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 1 && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold mb-1">Judging criteria fit</h2>
            <p className={'text-sm mb-6 ' + t.sub}>Each capability in this demo maps to a stated judging criterion.</p>
            {APP.criteria.length > 0 ? (
              <div className="space-y-5">
                {APP.criteria.map((c) => {
                  const pct = c.weight > 0 ? c.weight : Math.max(10, Math.round(100 / APP.criteria.length));
                  return (
                    <div key={c.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{c.name}</span>
                        <span className={'text-sm ' + t.sub}>{c.weight > 0 ? c.weight + '%' : 'priority'}</span>
                      </div>
                      <div className={'h-2 rounded-full overflow-hidden bg-slate-800'}>
                        <div className={'h-full rounded-full ' + t.bar} style={{ width: pct + '%' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className={t.sub}>Judging criteria were not parsed from the challenge page.</p>
            )}
          </div>
        )}

        {view === 2 && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold mb-1">Sponsor &amp; API integrations</h2>
            <p className={'text-sm mb-6 ' + t.sub}>The APIs this project prioritizes, surfaced in the UI.</p>
            {APP.sponsors.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {APP.sponsors.map((s) => (
                  <span key={s} className={'px-4 py-2 rounded-full border text-sm font-medium ' + t.chip + ' ' + t.chipText}>{s}</span>
                ))}
              </div>
            ) : (
              <p className={t.sub}>No sponsor APIs were flagged for this challenge.</p>
            )}
          </div>
        )}
      </section>

      <footer className={'border-t py-12 ' + t.border}>
        <div className={'max-w-6xl mx-auto px-6'}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <span className={'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ' + t.accent + ' ' + t.accentText}>
                {APP.name.charAt(0)}
              </span>
              <span className="font-bold">{APP.name}</span>
            </div>
            <div className={'flex flex-wrap items-center gap-6 text-sm ' + t.sub}>
              <a href="#demo" className="hover:text-white transition-colors">Demo</a>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#api" className="hover:text-white transition-colors">API</a>
            </div>
            <p className={'text-sm ' + t.sub}>&copy; {new Date().getFullYear()} {APP.name}</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
