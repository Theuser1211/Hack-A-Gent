import { SAMPLE_CALLS } from './pipeline/dialogue.js';
import { analyzeCall } from './pipeline/analysis.js';

function box(title: string, lines: string[]): void {
  const width = Math.max(title.length + 4, ...lines.map((l) => l.length)) + 4;
  const top = '┌' + '─'.repeat(width - 2) + '┐';
  const bottom = '└' + '─'.repeat(width - 2) + '┘';
  console.log(top);
  console.log('│ ' + title.padEnd(width - 4) + ' │');
  console.log('│' + '─'.repeat(width - 2) + '│');
  for (const l of lines) console.log('│ ' + l.padEnd(width - 4) + ' │');
  console.log(bottom);
}

export function runCli(): void {
  console.log();
  console.log('  EchoIntel — local conversation intelligence');
  console.log('  Analyzes prepared call transcripts through the Call-E pipeline boundary.');
  console.log();
  for (const call of SAMPLE_CALLS) {
    const a = analyzeCall(call);
    console.log(`  ◆ ${call.title}  (${call.context})`);
    console.log();
    console.log(`    Sentiment : ${a.sentiment.label.padEnd(8)}  score ${a.sentiment.score.toFixed(2)}  confidence ${Math.round(a.sentiment.confidence * 100)}%`);
    console.log(`    Topics    : ${a.topics.map((t) => `${t.topic} ${t.weight}%`).join(' · ')}`);
    console.log(`    Summary   : ${a.summary}`);
    if (a.actionItems.length) {
      console.log(`    Actions   :`);
      for (const item of a.actionItems) console.log(`                 • ${item}`);
    }
    const m = a.metrics;
    console.log(
      `    Metrics   : agent ${ms(m.talkTimeAgentMs)} · customer ${ms(m.talkTimeCustomerMs)} · words ${m.wordCount} · interjections ${m.interjections}`,
    );
    console.log();
  }
  console.log('  Pipeline boundary: local deterministic analysis — connect the real Call-E');
  console.log('  provider through the CalleyApiProvider interface for live calls.');
  console.log();
}

function ms(v: number): string {
  return v >= 60_000 ? `${(v / 60_000).toFixed(1)}m` : `${Math.round(v / 1000)}s`;
}
