import { NextResponse } from 'next/server';

interface AnalyzeRequest {
  input: string;
}

interface AnalyzeResult {
  summary: string;
  score: number;
  category: string;
  signals: Array<{ name: string; value: number }>;
  recommendation: string;
}

const KEYWORDS: Record<string, string[]> = {
  bug: ['error', 'bug', 'broken', 'fails', 'crash', 'exception', 'undefined', 'null', 'throws'],
  feature: ['feature', 'request', 'want', 'need', 'add', 'support', 'implement'],
  performance: ['slow', 'latency', 'timeout', 'lag', 'bottleneck', 'memory', 'cpu'],
  ux: ['ux', 'ui', 'design', 'confusing', 'hard to use', 'unclear'],
};

function analyzeText(input: string): AnalyzeResult {
  const text = input.toLowerCase();
  const wordCount = input.trim().split(/s+/).filter(Boolean).length;

  const signals = Object.entries(KEYWORDS).map(([name, kws]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: kws.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0),
  }));

  const top = signals.reduce((a, b) => (a.value >= b.value ? a : b));
  const category = top.value > 0 ? top.name : 'General';

  const score = Math.min(100, Math.round(40 + wordCount * 1.5 + top.value * 8));

  const sentences = input.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
  const summary = sentences[0] ? sentences[0].slice(0, 200) : input.slice(0, 200);

  const recMap: Record<string, string> = {
    Bug: 'Open a focused investigation: reproduce locally, isolate the failing input, and write a regression test before patching.',
    Feature: 'Validate the request against the roadmap. If aligned, spec the smallest end-to-end slice and ship behind a flag.',
    Performance: 'Profile the hot path. Measure before optimising — a single metric will tell you where to look.',
    Ux: 'Watch three users try the flow. Their confusion will localise the redesign.',
    General: 'Route to the appropriate team and follow up within one business day.',
  };
  const recommendation = recMap[category] ?? recMap.General!;

  return { summary, score, category, signals, recommendation };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AnalyzeRequest;
    if (!body.input || typeof body.input !== 'string' || body.input.trim().length === 0) {
      return NextResponse.json(
        { error: { message: 'Input text is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
    const result = analyzeText(body.input);
    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid request body', code: 'PARSE_ERROR' } },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ data: { status: 'analyze service ready' } });
}
