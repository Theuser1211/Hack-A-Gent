import { IntentEngine } from './engine.js';
import { loadDataset } from './data.js';
import { features } from './tokenizer.js';
import { predict } from './model.js';

const HELP = `Kilima — an on-device intent classifier for low-connectivity environments

Usage:
  npm start -- <command> [args]

Commands:
  inspect "<text>"   classify a single utterance (top-3 with probabilities)
  eval               run the full bundled sample set and report accuracy
  train [epochs]     train the model locally (deterministic seed) and show stats
  quantize           report an INT8 quantization simulation of the weights
  serve [port]       start the web demo on the given port (default 8800)
  --json             append to any command to emit JSON instead of a table

Examples:
  npm start -- inspect "will it rain in Nakuru this weekend"
  npm start -- eval --json
`;

function bar(prob: number, width = 22): string {
  const n = Math.round(prob * width);
  return '\u2588'.repeat(n) + '\u00b7'.repeat(width - n);
}

function inspectCmd(engine: IntentEngine, text: string, json: boolean): void {
  if (!text) {
    console.log('kilima: expected an utterance — e.g. npm start -- inspect "set a timer for ten minutes"');
    process.exit(1);
  }
  const { top } = engine.topK(text, 3);
  if (json) {
    console.log(JSON.stringify({ utterance: text, top }, null, 2));
    return;
  }
  console.log();
  console.log('  utterance: ' + text);
  console.log('  ───────────────────────────────────────────────');
  for (const t of top) {
    console.log(`  ${bar(t.prob)}  ${Math.round(t.prob * 100).toString().padStart(3)}%  ${t.label}`);
  }
  console.log('  ───────────────────────────────────────────────');
  console.log(`  inference: CPU only · ${engine.predict(text).latencyMs.toFixed(2)} ms · offline`);
  console.log();
}

function evalCmd(engine: IntentEngine, json: boolean): void {
  const res = engine.evaluate();
  if (json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  console.log();
  console.log('  Evaluation over the bundled sample set (measured, local)');
  console.log('  ────────────────────────────────────────────────────────');
  for (const r of res.rows) {
    const pct = String(r.accuracy).padStart(5);
    const mark = r.accuracy === 100 ? '✓' : r.accuracy >= 60 ? '◐' : '✗';
    console.log(`  ${mark} ${r.label.padEnd(12)} ${pct}%  (${r.correct}/${r.support})`);
  }
  console.log('  ────────────────────────────────────────────────────────');
  console.log(`  overall: ${res.overall}% (${res.correct}/${res.total})`);
  console.log('  Note: accuracy is over the bundled sample set only; the model is');
  console.log('  trained and evaluated on-device with no external data.');
  console.log();
}

function trainCmd(engine: IntentEngine, epochs: number, json: boolean): void {
  const t0 = Date.now();
  engine.trainLocal(epochs);
  const ms = Date.now() - t0;
  const res = engine.evaluate();
  const info = engine.modelInfo();
  if (json) {
    console.log(JSON.stringify({ epochs, trainingMs: ms, ...res, model: info }, null, 2));
    return;
  }
  console.log();
  console.log(`  Training: ${epochs} epochs · ${info.weights} weights · ${ms} ms`);
  console.log(`  Size    : ${info.weightBytes} bytes (fp32, weights only)`);
  console.log(`  Accuracy: ${res.overall}% (${res.correct}/${res.total}) over the sample set`);
  console.log('  The run is deterministic: the same seed reproduces the same weights.');
  console.log();
}

function quantizeCmd(engine: IntentEngine, json: boolean): void {
  const q = quantizeWeights(engine);
  if (json) {
    console.log(JSON.stringify(q, null, 2));
    return;
  }
  console.log();
  console.log('  INT8 quantization (local simulation on the trained weights)');
  console.log('  ──────────────────────────────────────────────────────────');
  console.log(`  fp32 bytes : ${q.fp32}`);
  console.log(`  int8 bytes : ${q.int8}  (${q.savedPct}% smaller)`);
  console.log(`  weight MSE : ${q.mse}  ·  max abs err: ${q.maxAbsErr}`);
  console.log(`  top-1 match: ${q.top1}`);
  console.log('  Computed from the real weights with scale/zero-point math.');
  console.log();
}

function quantizeWeights(engine: IntentEngine) {
  const m = engine.model;
  const quant = (w: Float32Array) => {
    let max = 0;
    for (let i = 0; i < w.length; i++) max = Math.max(max, Math.abs(w[i]!));
    const scale = max / 127;
    const q = new Int8Array(w.length);
    for (let i = 0; i < w.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(w[i]! / scale)));
    return { q, scale };
  };
  const w1q = quant(m.w1);
  const w2q = quant(m.w2);
  const d1 = new Float32Array(w1q.q.length);
  const d2 = new Float32Array(w2q.q.length);
  for (let i = 0; i < d1.length; i++) d1[i] = w1q.q[i]! * w1q.scale;
  for (let i = 0; i < d2.length; i++) d2[i] = w2q.q[i]! * w2q.scale;

  let mse = 0;
  let maxAbsErr = 0;
  for (let i = 0; i < d1.length; i++) {
    const e = d1[i]! - m.w1[i]!;
    mse += e * e;
    maxAbsErr = Math.max(maxAbsErr, Math.abs(e));
  }
  for (let i = 0; i < d2.length; i++) {
    const e = d2[i]! - m.w2[i]!;
    mse += e * e;
    maxAbsErr = Math.max(maxAbsErr, Math.abs(e));
  }
  mse /= d1.length + d2.length;

  const qmodel: typeof m = { ...m, w1: d1, w2: d2 };
  let matched = 0;
  for (const ex of engine.dataset.examples) {
    const x = features(ex.text, engine.vocab);
    if (argmax(predict(m, x)) === argmax(predict(qmodel, x))) matched++;
  }
  const total = engine.dataset.examples.length;
  const int8Bytes = d1.length + d2.length + m.b1.length * 4 + m.b2.length * 4;
  const fp32Bytes = (d1.length + d2.length + m.b1.length + m.b2.length) * 4;

  return {
    fp32: fp32Bytes,
    int8: int8Bytes,
    savedPct: Math.round(((fp32Bytes - int8Bytes) / fp32Bytes) * 1000) / 10,
    mse: Math.round(mse * 1e6) / 1e6,
    maxAbsErr: Math.round(maxAbsErr * 1e4) / 1e4,
    top1: `${Math.round((matched / total) * 1000) / 10}% (${matched}/${total})`,
  };
}

function argmax(v: Float32Array): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[best]!) best = i;
  return best;
}

export function runCli(argv: string[]): void {
  const args = argv.filter((a) => a !== '--json');
  const json = argv.includes('--json');
  const cmd = args[0] ?? 'help';

  if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
    console.log(HELP);
    return;
  }

  const dataset = loadDataset();
  const engine = new IntentEngine(dataset);

  switch (cmd) {
    case 'inspect':
      inspectCmd(engine, args.slice(1).join(' ').trim(), json);
      break;
    case 'eval':
      evalCmd(engine, json);
      break;
    case 'train': {
      const epochs = Number(args[1]) || 60;
      trainCmd(engine, epochs, json);
      break;
    }
    case 'quantize':
      quantizeCmd(engine, json);
      break;
    case 'serve': {
      const port = Number(args[1]) || 8800;
      void import('./server.js').then(({ startServer }) => startServer(engine, port));
      break;
    }
    default:
      console.log(`kilima: unknown command "${cmd}". Try: npm start -- help`);
      process.exit(1);
  }
}
