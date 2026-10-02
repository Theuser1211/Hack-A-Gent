import * as fs from 'node:fs';
import { appendFileSync } from 'node:fs';

const LOG = process.env.PROBE_LOG ?? `${process.env.TEMP}\\opencode\\nvidia-probe.log`;
const MODEL = process.env.PROBE_MODEL;
if (!MODEL) throw new Error('set PROBE_MODEL');

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync(LOG, line);
  } catch {
    console.log(line);
  }
}

const API_KEY = process.env.NVIDIA_API_KEY;
if (!API_KEY) throw new Error('NVIDIA_API_KEY required');

const systemPrompt =
  'You are an expert Next.js 14 / React 18 / TypeScript / Tailwind engineer. You always produce complete, buildable code in strict JSON with no commentary.';
const userPrompt = `You are generating code for a hackathon project. Respond ONLY with valid JSON matching {"files":[{"path":"src/app/page.tsx","content":"...","language":"tsx"}]}.

Generate a complete Next.js 14 landing page (src/app/page.tsx) for a volunteer-matching platform. It must:
- use 'use client' and React hooks
- render a hero section, a "how it works" 3-step section, an opportunities grid with filter buttons, an apply flow modal, and a footer
- be fully typed TypeScript, no placeholder stubs
- import { useState } from 'react' only
Return the full file content in the JSON. Make it at least 300 lines of real, working code.`;

log(`=== probing ${MODEL} (idle 60s, hard 300s) ===`);

const controller = new AbortController();
let idleTimer: NodeJS.Timeout | null = null;
let hardTimer: NodeJS.Timeout | null = null;
const armIdle = (): void => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    log(`IDLE-TIMEOUT fired (no bytes for 60s)`);
    controller.abort();
  }, 60000);
};
hardTimer = setTimeout(() => {
  log(`HARD-TIMEOUT fired (300s)`);
  controller.abort();
}, 300000);

const t0 = Date.now();
const fetchStart = Date.now();
log('POST /chat/completions ...');
let res: Response;
try {
  res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 16384,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
    signal: controller.signal,
  });
} catch (err) {
  log(`FETCH ERROR ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
log(`headers in ${Date.now() - fetchStart}ms, HTTP ${res.status}`);

if (!res.ok) {
  const text = await res.text().catch(() => '');
  log(`ERROR ${res.status}: ${text.slice(0, 300)}`);
  process.exit(0);
}

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let raw = '';
let lastByteLog = Date.now();
let firstByteMs = -1;
armIdle();
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      raw += decoder.decode(value, { stream: true });
      if (firstByteMs < 0) {
        firstByteMs = Date.now() - fetchStart;
        log(`first body bytes after ${firstByteMs}ms (chunk ${value.length}B)`);
      }
      if (Date.now() - lastByteLog > 15000) {
        lastByteLog = Date.now();
        log(`  ... streaming: ${raw.length} bytes so far (${Date.now() - fetchStart}ms)`);
      }
    }
    armIdle();
  }
  raw += decoder.decode();
} catch (err) {
  log(`READ ERROR ${err instanceof Error ? err.message : String(err)}`);
}
if (idleTimer) clearTimeout(idleTimer);
if (hardTimer) clearTimeout(hardTimer);

const totalMs = Date.now() - t0;
log(`DONE in ${totalMs}ms (firstByte ${firstByteMs}ms), raw ${raw.length} chars`);

let contentLen = 0;
let jsonOk = false;
try {
  const parsed = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
  contentLen = parsed.choices?.[0]?.message?.content?.length ?? 0;
  jsonOk = true;
} catch {
  jsonOk = false;
}
log(`parsed=${jsonOk} contentLen=${contentLen} head=${raw.trim().slice(0, 80).replace(/\n/g, ' ')}`);
process.exit(0);
