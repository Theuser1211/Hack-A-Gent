'use client';

import { useState } from 'react';

const APP = {"name":"Grove","tagline":"Grove — a planning agent that stress-tests your roadmap against the ways projects die and patches the top risk first.","problem":"TIS IHFC present Now or Never — a national hackathon for young innovators. Register for ₹500 inclusive of GST.","features":["Responsive UI with polished interactions","Deployed live demo accessible via URL"],"criteria":[],"sponsors":[],"screens":["Input — provide data or prompt to the AI model","Processing — show model working, streaming, or reasoning","Output — display results, confidence scores, or generated content"],"theme":"ai","primaryFeature":"Responsive UI with polished interactions","inputLabel":"Describe what you want to analyze","analyzeVerb":"Analyze","sample":"A customer support ticket complaining about slow checkout on mobile devices, with intermittent payment failures."};

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
  default: { bg: 'bg-slate-950', text: 'text-white', sub: 'text-slate-400', border: 'border-slate-800', card: 'bg-slate-900/50 border-slate-800', accent: 'bg-violet-600 hover:bg-violet-500', accentText: 'text-white', chip: 'bg-violet-500/10 border-violet-500/30', chipText: 'text-violet-300', bar: 'bg-violet-500', badge: 'bg-violet-500/20 border-violet-500/30 text-violet-200' },
};

export default function Home() {
  const t: Theme = THEMES[APP.theme] ?? THEMES.default;
  const [view, setView] = useState(0);
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
            <p className={'text-sm mb-6 ' + t.sub}>{APP.analyzeVerb} your input — the frontend calls the backend, the backend runs the logic, the result renders below. This is the full demo loop, end to end.</p>
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
              </div>
            </div>
            <div className={'mt-5 p-4 rounded-lg border font-mono text-xs overflow-x-auto ' + t.card}>
              {analyzeState === 'idle' && <span className={t.sub}>Result will appear here.</span>}
              {analyzeState === 'loading' && <span className={t.sub}>Calling /api/analyze...</span>}
              {analyzeState === 'error' && <span className="text-red-400">API unreachable — start the dev server.</span>}
              {analyzeState === 'ok' && <pre className="whitespace-pre-wrap">{analyzeBody}</pre>}
            </div>
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

      <footer className={'border-t py-8 ' + t.border}>
        <div className={'max-w-6xl mx-auto px-6 text-center text-sm ' + t.sub}>
          <p>{APP.name} — a working demo generated for this challenge.</p>
        </div>
      </footer>
    </main>
  );
}
