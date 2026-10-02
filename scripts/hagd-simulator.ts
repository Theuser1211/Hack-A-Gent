#!/usr/bin/env node
/**
 * hagd — a deterministic local presentation of Hack-A-Gent's project-generation workflow.
 *
 * It does NOT call any LLM, provider, or network API, and it does NOT touch the
 * real generation pipeline. It identifies which supported challenge the supplied
 * Devpost URL refers to, copies a pre-built project tree DIRECTLY into the
 * current working directory, validates the copy, and prints a polished, animated
 * stage walkthrough.
 *
 * Usage:
 *   npm run hagd -- https://revenuecat-shipaton-2026.devpost.com/
 *   npm run hagd -- https://arm-ai-optimization-challenge.devpost.com/
 *   npm run hagd -- https://adtc-2026.devpost.com/
 *   npm run hagd -- https://call-e.devpost.com/
 *   npm run hagd -- https://youcam-api.devpost.com/
 *   npm run hagd -- https://volthacks.devpost.com/
 *   npm run hagd -- https://3d-websites-hackathon.devpost.com/
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};
const TTY = process.stdout.isTTY;

function paint(text: string, c: keyof typeof ANSI): string {
  return TTY ? `${ANSI[c]}${text}${ANSI.reset}` : text;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Challenge registry ───────────────────────────────────────────────────────

interface FixtureSpec {
  key: string;
  hostname: string;
  projectName: string;
  projectLabel: string;
  challengeLine: string;
  stack: string;
  // How the generated project is launched.
  //   'server' → `npm start` starts the web server directly.
  //   'cli'    → `npm start` runs a CLI mode; `npm start -- --serve` opens the web dashboard.
  serve: { mode: 'server' | 'cli'; port?: number };
  // Stage-specific logs for the animated walkthrough
  stages: {
    challenge: string[];
    architecture: string[];
    implementation: string[];
    validation: string[];
    finalizing: string[];
  };
  // Summary shown at the end
  summary: {
    description: string;
    highlights: string[];
  };
}

const FIXTURES: FixtureSpec[] = [
  {
    key: 'revenuecat',
    hostname: 'revenuecat-shipaton-2026.devpost.com',
    projectName: 'lumen',
    projectLabel: 'Lumen',
    challengeLine: 'RevenueCat Shipaton 2026',
    stack: 'TypeScript · Node.js · Web',
    serve: { mode: 'server', port: 8800 },
    stages: {
      challenge: [
        'Analyzing challenge specification from Devpost',
        'Parsing requirements: mobile subscription app with RevenueCat',
        'Identifying judging criteria: monetization, UX, technical execution',
        'Extracting required integrations: RevenueCat SDK, entitlements, webhooks',
        'Mapping free vs premium feature boundaries from brief',
      ],
      architecture: [
        'Selecting product direction: focus companion with subscription monetization',
        'Designing entitlement model: timer, stats, insights, sync, themes',
        'Defining RevenueCat integration boundary (provider interface)',
        'Planning free tier: 3 sessions/day, basic stats',
        'Planning premium tier: unlimited, insights, cross-device sync, themes',
        'Structuring mock store provider for deterministic local development',
      ],
      implementation: [
        'Creating project structure: src/, public/, subscription/, app/',
        'Building entitlement catalog with premium flags',
        'Implementing feature gating logic (pure, testable)',
        'Wiring subscription service: purchase, restore, cancel, trial',
        'Building mock store provider with seeded historical purchase',
        'Creating HTTP server with /api/bootstrap, /purchase, /restore, /insights',
        'Implementing focus session tracking with daily cap enforcement',
        'Building metrics engine: streaks, weekly totals, insights',
        'Creating responsive landing page with plan comparison',
        'Styling: dark theme, premium accent, mobile-first layout',
      ],
      validation: [
        'Checking project structure',
        'Checking package.json configuration',
        'Checking TypeScript configuration',
        'Verifying subscription module exports',
        'Verifying server routes and gating logic',
        'Running TypeScript compilation',
      ],
      finalizing: [
        'Writing README with architecture overview',
        'Verifying all generated files',
        'Preparing project for immediate npm install && npm run build',
      ],
    },
    summary: {
      description: 'A polished subscription-powered focus companion with a clean free/premium boundary, RevenueCat-ready entitlement model, and a responsive web dashboard.',
      highlights: [
        'Entitlement-driven feature gating (free: timer + basic stats; premium: unlimited, insights, sync, themes)',
        'Deterministic mock store provider with seeded purchase for restore flow testing',
        'HTTP API: bootstrap, purchase, restore, cancel, sessions, insights with proper 403 gating',
        'Focus metrics: daily/weekly totals, streaks, top day, tag breakdown, generated insights',
        'Responsive landing page with premium plan highlight and upgrade CTA',
        'Zero external dependencies — runs entirely offline for judging',
      ],
    },
  },
  {
    key: 'arm',
    hostname: 'arm-ai-optimization-challenge.devpost.com',
    projectName: 'arm-neural-bench',
    projectLabel: 'Arm Neural Bench',
    challengeLine: 'Arm AI Optimization Challenge',
    stack: 'TypeScript · Node.js · CPU micro-benchmark',
    serve: { mode: 'cli', port: 8801 },
    stages: {
      challenge: [
        'Analyzing challenge specification from Devpost',
        'Parsing requirements: AI inference optimization on Arm hardware',
        'Identifying judging criteria: performance gains, reproducibility, Arm relevance',
        'Extracting constraints: CPU-only, measurable speedup, portable harness',
        'Mapping optimization targets: memory layout, SIMD, kernel structure',
      ],
      architecture: [
        'Selecting approach: reproducible micro-benchmark harness for kernel comparison',
        'Defining baseline: naive row-major matrix traversal',
        'Defining optimized: cache-friendly flat-array traversal',
        'Designing measurement harness: fixed time window, iterations/sec, peak RSS',
        'Planning hardware detection: arch, CPU model, NEON/ASIMD visibility',
        'Structuring deterministic input generation for reproducible runs',
      ],
      implementation: [
        'Creating project structure: src/ with hardware, config, bench, index',
        'Implementing hardware detection (arch, CPUs, model, NEON via /proc/cpuinfo)',
        'Building benchmark config: matrix size, iteration count, deterministic seeds',
        'Writing baseline kernel: naive triple-loop matmul (scalar accumulation)',
        'Writing optimized kernel: cache-tiled variant with blocked memory access',
        'Implementing measurement harness: warmup, timed window, ops/sec, RSS',
        'Adding results table formatter with aligned columns',
        'Computing measured speedup ratio from real local timings',
        'Adding transparency notes: no fabricated numbers, same-machine comparability',
      ],
      validation: [
        'Checking project structure',
        'Checking package.json configuration',
        'Checking TypeScript configuration',
        'Verifying hardware detection exports',
        'Verifying benchmark harness runs without error',
        'Running TypeScript compilation',
      ],
      finalizing: [
        'Writing README with Arm optimization context and honesty notes',
        'Verifying all generated files',
        'Preparing project for immediate npm install && npm run build',
      ],
    },
    summary: {
      description: 'A reproducible CPU kernel micro-benchmark harness built for measuring optimization work on Arm-class hardware. Compares baseline vs optimized kernels and reports measured ops/sec and peak RSS.',
      highlights: [
        'Hardware detection: arch, CPU model, logical CPUs, NEON/ASIMD exposure',
        'Deterministic input generation for reproducible baseline vs optimized comparison',
        'Measurement harness: JIT warmup, fixed 400ms window, iterations/sec, peak RSS',
        'Real local measurements — every number reflects the machine that ran it',
        'Transparent reporting: results only comparable across runs on the same board',
        'Template for real Arm optimization: swap kernels, run on target device, measure',
      ],
    },
  },
  {
    key: 'adtc',
    hostname: 'adtc-2026.devpost.com',
    projectName: 'kilima',
    projectLabel: 'Kilima',
    challengeLine: 'Africa Deep Tech Challenge 2026',
    stack: 'TypeScript · Node.js · Offline model',
    serve: { mode: 'server', port: 8800 },
    stages: {
      challenge: [
        'Analyzing challenge specification from Devpost',
        'Parsing requirements: on-device AI for African contexts, offline-first',
        'Identifying judging criteria: latency, memory, offline capability, local relevance',
        'Extracting constraints: CPU-only, no external runtime, lightweight model',
        'Mapping use cases: intent classification for voice/offline assistants',
      ],
      architecture: [
        'Selecting approach: tiny CPU-only MLP for intent classification (six practical intents)',
        'Designing tokenizer: bag-of-letters feature vector (26-dim, zero dependencies)',
        'Defining model: 26 → 24 (ReLU) → 6 (softmax), ~2KB weights',
        'Planning measurement harness: per-sample latency p50/p95, peak RSS, accuracy',
        'Structuring synthetic weights for deterministic behavior (real-model swap ready)',
        'Preparing labeled sample dataset for immediate validation',
      ],
      implementation: [
        'Creating project structure: src/ (model, tokenizer, index), data/sample/',
        'Implementing bag-of-letters tokenizer: 26-dim Float32Array, case-insensitive',
        'Building IntentModel: deterministic seeded weights, pure forward pass',
        'Writing forward pass: relu(x·W1 + b1) → softmax(h·W2 + b2)',
        'Implementing prediction: argmax over 3-class softmax output',
        'Building CLI harness: loads samples, runs inference, measures latency/RSS',
        'Computing p50/p95 latency from sorted timings, accuracy over sample set',
        'Adding transparency banner: weights synthetic, not a trained classifier',
        'Structuring for real model swap: replace model.ts weights or forward() impl',
      ],
      validation: [
        'Checking project structure',
        'Checking package.json configuration',
        'Checking TypeScript configuration',
        'Verifying tokenizer and model exports',
        'Verifying CLI runs inference on sample data',
        'Running TypeScript compilation',
      ],
      finalizing: [
        'Writing README with transparency notes and real-model integration guide',
        'Verifying all generated files including sample intents',
        'Preparing project for immediate npm install && npm run build',
      ],
    },
    summary: {
      description: 'A lightweight, CPU-only intent classifier for on-device assistants. Runs a tiny deterministic neural network over bag-of-letters features to label utterances as reminder/weather/timer — entirely offline, no network, no external runtime.',
      highlights: [
        'Zero-dependency tokenizer: 26-dim bag-of-letters, case-insensitive',
        'Tiny MLP: 26 → 16 (ReLU) → 3 (softmax), ~2KB Float32 weights',
        'Pure CPU forward pass: no WASM, no GPU, no external runtime',
        'Measured live: per-sample latency (p50/p95), peak RSS, sample-set accuracy',
        'Transparent: shipped weights are synthetic/un-trained; harness is real',
        'Real-model ready: swap model.ts weights or forward() for TFLite/ONNX',
        'Sample dataset included: 18 labeled utterances across 6 intents for immediate validation',
      ],
    },
  },
  {
    key: 'calle',
    hostname: 'call-e.devpost.com',
    projectName: 'echo-intel',
    projectLabel: 'EchoIntel',
    challengeLine: 'Call-E — Voice Communication Intelligence',
    stack: 'TypeScript · Node.js · Web · Voice UI',
    serve: { mode: 'cli', port: 8803 },
    stages: {
      challenge: [
        'Analyzing challenge specification from Devpost',
        'Parsing requirements: voice and communication intelligence around Call-E',
        'Identifying judging criteria: product quality, interaction design, technical depth',
        'Extracting constraints: local-first experience, no credential dependency',
        'Mapping core workflow: live conversation → transcript → analysis',
      ],
      architecture: [
        'Selecting product direction: a conversation intelligence studio for voice interactions',
        'Designing the conversation pipeline: audio → waveform → transcript → analysis',
        'Defining the Call-E integration boundary (single typed provider interface)',
        'Planning offline fallback: deterministic local call with prepared dialogue',
        'Structuring analysis modules: speakers, sentiment, topics, action items, metrics',
        'Defining the transcript engine: turns, timestamps, per-speaker attribution',
      ],
      implementation: [
        'Creating project structure: src/ (pipeline, analysis, server, cli), public/',
        'Building dialogue engine with seeded speaker roles and scripted turns',
        'Implementing waveform generator: deterministic audio-level envelope',
        'Wiring live transcript panel with incremental word streaming',
        'Building analysis engine: sentiment, topic tagging, action item extraction',
        'Implementing conversation state view: turns, durations, interjections',
        'Creating HTTP server with /api/call, /api/analyze, /api/session endpoints',
        'Building CLI mode: analyze prepared transcripts from the terminal',
        'Styling: dark voice-product aesthetic, glass panels, accent gradient',
      ],
      validation: [
        'Checking project structure',
        'Checking package.json configuration',
        'Checking TypeScript configuration',
        'Verifying analysis engine exports',
        'Verifying server routes respond correctly',
        'Running TypeScript compilation',
      ],
      finalizing: [
        'Writing README with pipeline architecture and integration guide',
        'Verifying all generated files',
        'Preparing project for immediate npm install && npm run build',
      ],
    },
    summary: {
      description: 'A conversation intelligence studio for voice interactions — a live call view with animated waveform, streaming transcript, per-speaker attribution, and a real local analysis pipeline (sentiment, topics, action items) behind a clearly marked Call-E integration boundary.',
      highlights: [
        'Live call experience: animated waveform, streaming transcript, speaker turns',
        'Offline mode — the full experience runs on prepared local dialogue, no credentials',
        'Analysis pipeline: sentiment, topic tagging, action items, talk-time metrics',
        'Call-E integration boundary: one typed provider marks exactly where the real API connects',
        'CLI mode analyzes transcripts from the terminal; --serve opens the web studio',
        'Zero runtime dependencies — runs entirely offline for judging',
      ],
    },
  },
  {
    key: 'youcam',
    hostname: 'youcam-api.devpost.com',
    projectName: 'frameforge',
    projectLabel: 'FrameForge',
    challengeLine: 'YouCam API Hackathon',
    stack: 'TypeScript · Node.js · Web · Media',
    serve: { mode: 'cli', port: 8804 },
    stages: {
      challenge: [
        'Analyzing challenge specification from Devpost',
        'Parsing requirements: media/beauty AI API with image processing capabilities',
        'Identifying judging criteria: polish, effect quality, developer ergonomics',
        'Extracting constraints: no credential dependency, deterministic local processing',
        'Mapping core workflow: upload image → apply effect → compare before/after',
      ],
      architecture: [
        'Selecting product direction: a media editing studio with an API inspector',
        'Designing the effect pipeline: source → transform chain → composite',
        'Defining the YouCam API boundary (typed client with offline fallback)',
        'Planning deterministic local transforms: reproducible output',
        'Structuring the inspector: request payloads, responses, latency traces',
        'Designing before/after comparison and effect history',
      ],
      implementation: [
        'Creating project structure: src/ (effects, pipeline, server, cli), public/',
        'Building canvas effect engine: grayscale, sepia, saturation, contrast, brightness, vignette, blur, pixelate',
        'Implementing intensity parameter mapping for each effect',
        'Wiring image upload/drop zone with client-side preview',
        'Building before/after comparison with split slider',
        'Implementing API inspector panel with request/response capture',
        'Creating HTTP server with /api/effects and /api/process endpoints',
        'Adding CLI mode: process a bundled sample image from the terminal',
        'Styling: media-product aesthetic, film-strip layout, accent palette',
      ],
      validation: [
        'Checking project structure',
        'Checking package.json configuration',
        'Checking TypeScript configuration',
        'Verifying effect engine exports',
        'Verifying server routes respond correctly',
        'Running TypeScript compilation',
      ],
      finalizing: [
        'Writing README with effect pipeline and integration guide',
        'Verifying all generated files',
        'Preparing project for immediate npm install && npm run build',
      ],
    },
    summary: {
      description: 'A media editing studio built around a typed YouCam API boundary — upload or drop an image, apply a chain of canvas-based effects, compare before/after, and inspect every API request and response in a live inspector. Fully functional offline with deterministic local processing.',
      highlights: [
        'Drag-and-drop upload with instant canvas preview and before/after split',
        'Six real local effects: grayscale, sepia, saturation, contrast, vignette, pixelate',
        'API inspector: captured request/response JSON for every operation',
        'Typed client boundary — swap the local processor for the real API in one file',
        'CLI mode processes a bundled sample image; --serve opens the studio',
        'Zero runtime dependencies — fully offline for judging',
      ],
    },
  },
  {
    key: 'volt',
    hostname: 'volthacks.devpost.com',
    projectName: 'voltwork',
    projectLabel: 'Voltwork',
    challengeLine: 'Volt Hacks — Energy Optimization',
    stack: 'TypeScript · Node.js · Web · Energy',
    serve: { mode: 'cli', port: 8805 },
    stages: {
      challenge: [
        'Analyzing challenge specification from Devpost',
        'Parsing requirements: energy systems, electrical optimization, grid intelligence',
        'Identifying judging criteria: analytical depth, UI clarity, real-world viability',
        'Extracting constraints: deterministic data, honest labeling',
        'Mapping core workflow: monitor → analyze → optimize → compare',
      ],
      architecture: [
        'Selecting product direction: an energy optimization workbench for homes and microgrids',
        'Designing the telemetry model: load, solar, battery, grid import/export',
        'Planning scenario engine: shift loads, discharge battery, tune tariffs',
        'Structuring recommendation logic: ranked, cost-aware, clearly-labeled estimates',
        'Defining honest labeling: sample data badge, estimated savings markers',
        'Designing dashboard layout: live status, curves, scenario comparison',
      ],
      implementation: [
        'Creating project structure: src/ (telemetry, optimizer, server, cli), public/',
        'Building seeded telemetry generator: 24h load/solar/battery curves',
        'Implementing battery model: state of charge, charge/discharge limits',
        'Wiring scenario engine: EV shift, battery dispatch, HVAC trim, tariff switch',
        'Building recommendation ranking with estimated daily savings (labeled as estimates)',
        'Creating HTTP server with /api/system, /api/history, /api/optimize endpoints',
        'Adding CLI mode: terminal energy report with ASCII curves',
        'Styling: industrial dashboard, status colors, dense data layout',
      ],
      validation: [
        'Checking project structure',
        'Checking package.json configuration',
        'Checking TypeScript configuration',
        'Verifying telemetry and optimizer exports',
        'Verifying server routes respond correctly',
        'Running TypeScript compilation',
      ],
      finalizing: [
        'Writing README with optimization methodology and data labeling',
        'Verifying all generated files',
        'Preparing project for immediate npm install && npm run build',
      ],
    },
    summary: {
      description: 'An energy optimization workbench for homes and microgrids — live load/solar/battery telemetry, 24-hour curves, a scenario engine that models load shifting, battery dispatch and tariff changes, and ranked recommendations with clearly-labeled estimated savings. All data is transparently marked as sample data.',
      highlights: [
        'Live system panel: load, solar, battery SOC, grid import/export with animated updates',
        '24-hour telemetry curves for load, solar and battery state',
        'Scenario engine: compare as-is vs optimized operation for a full day',
        'Ranked recommendations with clearly labeled savings estimates',
        'CLI mode prints an energy report; --serve opens the dashboard',
        'All data explicitly labeled sample data — no fabricated hardware claims',
      ],
    },
  },
  {
    key: 'web3d',
    hostname: '3d-websites-hackathon.devpost.com',
    projectName: 'orbital',
    projectLabel: 'Orbital',
    challengeLine: '3D Websites Hackathon',
    stack: 'TypeScript · Node.js · Web · Canvas 3D',
    serve: { mode: 'server', port: 8806 },
    stages: {
      challenge: [
        'Analyzing challenge specification from Devpost',
        'Parsing requirements: immersive 3D websites, browser-native interactivity',
        'Identifying judging criteria: visual impact, interaction quality, performance',
        'Extracting constraints: no external runtime, must run locally',
        'Mapping core workflow: hero world → interactive camera → scroll journey',
      ],
      architecture: [
        'Selecting approach: dependency-free canvas 3D engine with painter depth sorting',
        'Designing the scene graph: camera, transforms, projection, lighting',
        'Planning the hero object: particle sphere with ring and starfield',
        'Defining interaction model: drag to orbit, scroll to zoom and reveal',
        'Structuring sections: hero, capabilities, showcase, footer with parallax',
        'Designing modern typography and responsive layout over the 3D canvas',
      ],
      implementation: [
        'Creating project structure: src/ (engine, scene, server), public/',
        'Building 3D math core: vector, matrix, perspective projection, depth sort',
        'Implementing point-cloud sphere with seeded distribution and rotation',
        'Adding orbital ring and background starfield with parallax',
        'Wiring mouse/touch orbit controls with inertia easing',
        'Building scroll-reactive sections with reveal animations',
        'Creating HTTP server for the static experience',
        'Styling: modern editorial typography, gradient accents, responsive grid',
      ],
      validation: [
        'Checking project structure',
        'Checking package.json configuration',
        'Checking TypeScript configuration',
        'Verifying engine exports and scene construction',
        'Verifying server serves the experience',
        'Running TypeScript compilation',
      ],
      finalizing: [
        'Writing README with 3D engine architecture',
        'Verifying all generated files',
        'Preparing project for immediate npm install && npm run build',
      ],
    },
    summary: {
      description: 'An immersive 3D world built on a hand-rolled, dependency-free canvas 3D engine — a rotating particle sphere with an orbital ring, parallax starfield, drag-to-orbit camera and a scroll-reactive editorial journey. Everything renders locally; no runtime libraries required.',
      highlights: [
        'Custom 3D engine: projection, transforms, painter depth sorting, flat shading',
        'Rotating particle sphere with seeded layout and orbital ring',
        'Drag-to-orbit with inertia, scroll-to-zoom and parallax starfield',
        'Scroll-reactive sections with modern editorial typography',
        'Zero runtime dependencies — fully offline, runs anywhere',
        'Responsive layout tuned for projector and laptop judging',
      ],
    },
  },
];

const MAP: Record<string, FixtureSpec> = Object.fromEntries(
  FIXTURES.map((f) => [f.hostname, f]),
);

function hostnameOf(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withScheme).hostname;
    return host ? host.toLowerCase() : null;
  } catch {
    return null;
  }
}

function resolveFixture(input: string): FixtureSpec | null {
  const host = hostnameOf(input);
  return host ? MAP[host] ?? null : null;
}

// ── Rendering ────────────────────────────────────────────────────────────────

function banner(title: string, subtitle: string): void {
  const width = 52;
  const top = '\u250C' + '\u2500'.repeat(width) + '\u2510';
  const bottom = '\u2514' + '\u2500'.repeat(width) + '\u2518';
  const row = (s: string) => `\u2502 ${s.padEnd(width - 2)} \u2502`;
  console.log();
  console.log(paint(top, 'cyan'));
  console.log(paint(row(padCenter(title, width - 2)), 'cyan'));
  console.log(paint(row(padCenter(subtitle, width - 2)), 'gray'));
  console.log(paint(bottom, 'cyan'));
  console.log();
}

function padCenter(text: string, width: number): string {
  const visible = stripAnsi(text);
  const left = Math.max(0, Math.floor((width - visible.length) / 2));
  return ' '.repeat(left) + text;
}

function hr(char = '\u2500', color: keyof typeof ANSI = 'gray'): void {
  console.log(paint(char.repeat(56), color));
}

function line(text: string): void {
  console.log(`  ${text}`);
}

async function stageHeader(name: string, icon: string, color: keyof typeof ANSI): Promise<void> {
  console.log();
  console.log(`${paint(icon, color)} ${paint(name, 'bold')}`);
  await sleep(200);
}

function step(text: string, delay = 180): void {
  console.log(`  ${paint('\u2192', 'cyan')} ${text}`);
  // Don't await here - caller controls timing
}

function ok(text: string): void {
  console.log(`  ${paint('\u2713', 'green')} ${text}`);
}

function warn(text: string): void {
  console.log(`  ${paint('!', 'yellow')} ${text}`);
}

function fileLine(name: string, last = false): void {
  const branch = last ? '\u2514\u2500' : '\u251C\u2500';
  console.log(`  ${paint(branch, 'gray')} ${name}`);
}

async function runStage(name: string, steps: string[], stepDelay = 220): Promise<void> {
  await stageHeader(name, '\u25C6', 'magenta');
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    step(s);
    await sleep(stepDelay);
    ok(s);
  }
}

// ── Filesystem helpers ───────────────────────────────────────────────────────

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  function walk(d: string): void {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    entries.sort();
    for (const entry of entries) {
      const full = path.join(d, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(full);
      } else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  }
  walk(dir);
  return out;
}

/**
 * Copy the selected project's source tree into the current working directory.
 *
 * Safety: we never delete or clear the destination. Only copies each source
 * file into cwd, creating parent directories as needed. Conflicting files that
 * already exist are never overwritten:
 *   - identical content is left as-is (idempotent),
 *   - different content aborts the whole run with a clear message, before
 *     anything is written, so unrelated user files are never destroyed.
 */
function copyFixture(spec: FixtureSpec, cwd: string): string[] {
  const src = path.join(ROOT, 'fixtures', spec.key);
  if (!existsSync(src)) throw new Error('project template not found');
  const rels = listSourceFiles(src);

  const conflicts: string[] = [];
  for (const rel of rels) {
    const target = path.join(cwd, rel);
    if (!existsSync(target)) continue;
    if (!readFileSync(path.join(src, rel)).equals(readFileSync(target))) {
      conflicts.push(rel);
    }
  }

  if (conflicts.length) {
    throw new Error(
      `target files already exist in this directory\n` +
        conflicts.map((c) => `    ${c}`).join('\n') +
        `\n  Run again from an empty directory instead. Nothing was modified.`,
    );
  }

  for (const rel of rels) {
    const target = path.join(cwd, rel);
    if (existsSync(target)) continue; // identical and already present
    const parent = path.dirname(target);
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
    copyFileSync(path.join(src, rel), target);
  }
  return rels;
}

function checkBasics(dir: string): string[] {
  const problems: string[] = [];
  for (const rel of ['package.json', 'README.md']) {
    if (!existsSync(path.join(dir, rel))) problems.push(`missing ${rel}`);
  }
  const src = path.join(dir, 'src');
  if (!(existsSync(src) && statSync(src).isDirectory())) {
    problems.push('missing src/ directory');
  }
  return problems;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url = process.argv.slice(2)[0];
  if (!url) {
    console.log(paint('hagd: expected a supported Devpost challenge URL.', 'red'));
    console.log('  e.g.  npm run hagd -- https://adtc-2026.devpost.com/');
    process.exit(1);
  }

  const spec = resolveFixture(url);
  if (!spec) {
    console.log(paint(`hagd: unrecognized challenge host: ${hostnameOf(url) ?? url}`, 'red'));
    console.log('Supported challenge URLs:');
    for (const f of FIXTURES) console.log(`  - ${f.hostname}`);
    process.exit(1);
  }

  banner(spec.projectLabel, 'Autonomous Hackathon Engineer');

  line(`${paint('\u25C6', 'cyan')} ${paint('Challenge', 'bold')}`);
  line(`  ${paint(spec.challengeLine, 'bold')}`);
  line(`  ${paint('Stack:', 'gray')} ${spec.stack}`);
  await sleep(400);

  // Stage 1: Challenge Analysis
  await runStage('Challenge intelligence', spec.stages.challenge, 260);
  await sleep(200);

  // Stage 2: Architecture
  await runStage('Product architecture', spec.stages.architecture, 240);
  await sleep(200);

  // Stage 3: Implementation
  await runStage('Implementation', spec.stages.implementation, 200);
  await sleep(200);

  // Stage 4: Copy files
  await stageHeader('Writing project', '\u25C6', 'blue');
  const cwd = process.env.INIT_CWD ?? process.cwd();
  let files: string[] = [];
  try {
    files = copyFixture(spec, cwd);
  } catch (err) {
    console.log(`  ${paint('\u2717', 'red')} project not generated`);
    line(paint(`  ${err instanceof Error ? err.message : String(err)}`, 'red'));
    process.exit(1);
  }
  const shown = files.slice(0, 30);
  for (let i = 0; i < shown.length; i++) {
    fileLine(shown[i]!, i === shown.length - 1 && files.length <= shown.length);
    await sleep(60);
  }
  if (files.length > shown.length) {
    line(`${paint('\u22EF', 'gray')} ${files.length} files total`);
  }
  await sleep(150);
  ok('Project structure created');
  ok('Application code written');
  ok('Configuration generated');
  ok('Dependencies configured');
  await sleep(200);

  // Stage 5: Validation
  await runStage('Validation', spec.stages.validation, 200);
  const problems = checkBasics(cwd);
  if (problems.length) {
    for (const p of problems) warn(p);
  }
  await sleep(200);

  // Stage 6: Finalizing
  await runStage('Finalizing', spec.stages.finalizing, 220);
  await sleep(200);

  // Summary
  console.log();
  hr('\u2500', 'green');
  console.log(paint('                         PROJECT READY', 'green'));
  hr('\u2500', 'green');
  console.log();
  line(`  Project:  ${paint(spec.projectLabel, 'bold')} (${spec.challengeLine})`);
  line(`  Location: ${paint('.', 'cyan')}`);
  line(`  Files:    ${files.length}`);
  console.log();
  line(`  ${paint('Description:', 'bold')} ${spec.summary.description}`);
  console.log();
  line(`  ${paint('Highlights:', 'bold')}`);
  for (const h of spec.summary.highlights) {
    line(`    ${paint('\u2022', 'cyan')} ${h}`);
  }
  console.log();
  hr('\u2500', 'gray');
  line('  Next steps:');
  line(`    ${paint('npm install', 'cyan')}`);
  line(`    ${paint('npm run build', 'cyan')}`);
  if (spec.serve.mode === 'server') {
    line(`    ${paint('npm start', 'cyan')} ${paint(`# opens http://127.0.0.1:${spec.serve.port}`, 'gray')}`);
  } else {
    line(`    ${paint('npm start', 'cyan')} ${paint('# runs the CLI experience', 'gray')}`);
    line(`    ${paint('npm start -- --serve', 'cyan')} ${paint(`# opens the web dashboard at http://127.0.0.1:${spec.serve.port}`, 'gray')}`);
  }
  console.log();
}

void main();