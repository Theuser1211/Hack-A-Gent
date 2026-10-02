import type { AnalysisResult, CallMetrics, CallTurn, SampleCall, TopicResult } from './types.js';

// ── Lexicons (small, local, deterministic) ───────────────────────────────────

const POSITIVE = new Set([
  'perfect', 'great', 'thanks', 'thank', 'relief', 'awesome', 'happy', 'glad', 'helpful', 'wonderful',
  'excellent', 'relieved', 'nice', 'good', 'best', 'sure', 'works', 'working',
]);

const NEGATIVE = new Set([
  'broken', 'error', 'cancel', 'cancellation', 'charge', 'charged', 'twice', 'fix', 'apolog', 'apology',
  'refund', 'wrong', 'issue', 'problem', 'failed', 'duplicate', 'want', 'unfortunately', 'worst',
]);

const TOPIC_MAP: Array<{ topic: string; words: string[] }> = [
  { topic: 'Shipping', words: ['shipped', 'tracking', 'warehouse', 'parcel', 'delivery', 'arrive', 'link', 'order'] },
  { topic: 'Billing', words: ['charge', 'charged', 'invoice', 'refund', 'billing', 'payment', 'duplicate', 'price', 'bill'] },
  { topic: 'Plan', words: ['plan', 'cancel', 'cancellation', 'tier', 'downgrade', 'priority', 'subscription', 'billing cycle'] },
  { topic: 'Support', words: ['support', 'help', 'helpdesk', 'priority support', 'retention', 'agent'] },
  { topic: 'Account', words: ['account', 'history', 'settings', 'email', 'saved', 'profile', 'card', 'password'] },
];

// ── Analysis implementation ──────────────────────────────────────────────────

function textOf(turns: CallTurn[]): string {
  return turns.flatMap((t) => t.words.map((w) => w.text)).join(' ');
}

function wordList(turns: CallTurn[]): string[] {
  return turns.flatMap((t) => t.words.map((w) => w.text.toLowerCase()));
}

function analyzeSentiment(turns: CallTurn[]): AnalysisResult['sentiment'] {
  const words = wordList(turns);
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) pos++;
    else if (NEGATIVE.has(w)) neg++;
  }
  const total = pos + neg;
  const score = total === 0 ? 0 : (pos - neg) / total;
  let label: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (score > 0.18) label = 'positive';
  else if (score < -0.18) label = 'negative';
  return { score, label, confidence: Math.min(0.96, 0.5 + total * 0.08) };
}

function analyzeTopics(turns: CallTurn[]): TopicResult[] {
  const words = wordList(turns);
  const counts = new Map<string, number>();
  for (const { topic, words: keys } of TOPIC_MAP) {
    let n = 0;
    for (const key of keys) {
      const k = key;
      for (const w of words) if (w === k) n++;
    }
    if (n > 0) counts.set(topic, n);
  }
  const max = Math.max(1, ...counts.values());
  return Array.from(counts.entries())
    .map(([topic, n]) => ({ topic, weight: Math.round((n / max) * 100) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
}

const ACTION_VERBS = new Set([
  'send', 'refund', 'switch', 'remove', 'reverse', 'update', 'fix', 're-send',
  're-save', 'sync', 'replace', 'escalate', 'schedule',
]);

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

function analyzeActionItems(turns: CallTurn[]): string[] {
  const items: string[] = [];
  const push = (s: string) => {
    const clean = s.trim().replace(/^(done|absolutely|right|yes|perfect|sure|of course)[,.]?\s*/i, '').trim();
    if (clean && !items.includes(clean)) items.push(clean.charAt(0).toUpperCase() + clean.slice(1));
  };

  for (const t of turns) {
    const text = t.words.map((w) => w.text).join(' ');
    for (const sentence of splitSentences(text)) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      const first = lower.split(/\s+/)[0] ?? '';
      const isQuestion = trimmed.endsWith('?');

      if (t.speaker === 'Agent') {
        // Commitments: imperative ("Send...", "Remove...") or "I will/have ...".
        const imperative = ACTION_VERBS.has(first.replace(/[^a-z-]/g, '')) || ACTION_VERBS.has(first);
        const commitment = /(i (will|have|ve|ll) (send|remove|refund|switch|reverse|update|fix|re-send|re-save|sync|schedule|escalate))/i.test(lower);
        if ((imperative || commitment) && !isQuestion) push(trimmed);
      } else {
        // Customer requests: "Could/Can you ...?".
        if (isQuestion && /^(could|can|please|is there any way)\b/i.test(lower)) push(trimmed);
      }
    }
  }
  return items.slice(0, 6);
}

function analyzeMetrics(turns: CallTurn[]): CallMetrics {
  let agent = 0;
  let customer = 0;
  let wordCount = 0;
  let longest = 0;
  let interjections = 0;

  for (const t of turns) {
    const dur = t.words.reduce((acc, w) => acc + w.durationMs, 0);
    if (t.speaker === 'Agent') agent += dur;
    else customer += dur;
    wordCount += t.words.length;
    longest = Math.max(longest, dur);
    // A short turn that lands in the middle of a longer opposite-speaker turn
    // is treated as an interjection.
    if (dur < 700 && t.words.length <= 6) interjections++;
  }

  let responseDelays = 0;
  let responseCount = 0;
  for (let i = 1; i < turns.length; i++) {
    const prev = turns[i - 1]!;
    const cur = turns[i]!;
    if (prev.speaker !== cur.speaker) {
      const prevEnd = prev.words[prev.words.length - 1]!.atMs + prev.words[prev.words.length - 1]!.durationMs;
      responseDelays += Math.max(0, cur.startMs - prevEnd);
      responseCount++;
    }
  }

  return {
    talkTimeAgentMs: agent,
    talkTimeCustomerMs: customer,
    interjections,
    wordCount,
    longestTurnMs: longest,
    avgResponseDelayMs: responseCount === 0 ? 0 : Math.round(responseDelays / responseCount),
  };
}

function summarize(turns: CallTurn[]): string {
  const sentiment = analyzeSentiment(turns);
  const topics = analyzeTopics(turns);
  const firstTopic = topics[0]?.topic ?? 'General';
  const tone = sentiment.label;
  return `${firstTopic} call resolved in ${turns.length} turns with a ${tone} tone. Customer concerns were addressed and the agent closed the interaction with a clear next step.`;
}

export function analyzeCall(call: SampleCall): AnalysisResult {
  return {
    callId: call.id,
    sentiment: analyzeSentiment(call.turns),
    topics: analyzeTopics(call.turns),
    actionItems: analyzeActionItems(call.turns),
    metrics: analyzeMetrics(call.turns),
    summary: summarize(call.turns),
    processedLocally: true,
    apiBoundary: 'CalleyApiProvider — replace with the real Call-E endpoint',
  };
}

export function analyzeTranscript(title: string, turns: CallTurn[]): AnalysisResult {
  const call: SampleCall = { id: 'adhoc', title, context: 'Ad-hoc transcript', durationMs: turns.reduce((a, t) => a + (t.words[t.words.length - 1]?.atMs ?? 0), 0), turns };
  return analyzeCall(call);
}
