import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getConfig, getGitHubToken } from '../config-manager.js';
import { ModelPerformanceTracker } from '../../kernel/routing/model-performance-tracker.js';
import { header, success, error, warn, info, dim, labeled } from '../output.js';
import { initializeProviders } from '../provider-init.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import type { ModelSpec } from '../../kernel/llm/llm-types.js';

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export async function doctorCommand(_ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  if (args.flags.routing) {
    return showRoutingReport();
  }

  const checks: CheckResult[] = [];
  const data: Record<string, unknown> = {};

  header('Hack-A-Gent Diagnostic');

  // Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1), 10);
  if (nodeMajor >= 18) {
    checks.push({ name: 'Node.js', status: 'pass', message: nodeVersion });
  } else {
    checks.push({ name: 'Node.js', status: 'fail', message: `${nodeVersion} (need >= 18)` });
  }
  data.nodeVersion = nodeVersion;

  // Git availability
  try {
    const gitVersion = execSync('git --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    checks.push({ name: 'Git', status: 'pass', message: gitVersion });
    data.gitVersion = gitVersion;
  } catch {
    checks.push({ name: 'Git', status: 'warn', message: 'not found (optional for most commands)' });
  }

  // Config file
  const config = getConfig();
  if (config?.llm.apiKey) {
    checks.push({ name: 'Configuration', status: 'pass', message: `provider: ${config.llm.provider}` });
    data.configProvider = config.llm.provider;
  } else if (config) {
    checks.push({ name: 'Configuration', status: 'warn', message: 'found but missing API key' });
  } else {
    checks.push({ name: 'Configuration', status: 'fail', message: 'not found. Run: hag setup' });
  }

  // GitHub token
  const githubToken = getGitHubToken();
  if (githubToken) {
    checks.push({ name: 'GitHub', status: 'pass', message: 'configured' });
  } else {
    checks.push({ name: 'GitHub', status: 'warn', message: 'not configured — GitHub features will be unavailable' });
  }

  // Provider connectivity
  if (config?.llm.apiKey) {
    try {
      const { providers } = initializeProviders();
      if (providers.length > 0) {
        const health = await providers[0]!.checkHealth();
        if (health.status === 'healthy') {
          checks.push({ name: 'Provider', status: 'pass', message: `${config.llm.provider} — connected` });
        } else {
          checks.push({ name: 'Provider', status: 'warn', message: `${config.llm.provider} — ${health.status}` });
        }
        data.providerHealth = health;
      }
    } catch (err) {
      checks.push({ name: 'Provider', status: 'fail', message: `${config.llm.provider} — ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // Workspace
  const wsOk = existsSync(process.cwd());
  checks.push({ name: 'Workspace', status: wsOk ? 'pass' : 'fail', message: process.cwd() });
  data.workspace = process.cwd();

  // Print results
  for (const check of checks) {
    if (check.status === 'pass') success(`${check.name}: ${check.message}`);
    else if (check.status === 'warn') warn(`${check.name}: ${check.message}`);
    else error(`${check.name}: ${check.message}`);
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  if (failed > 0) {
    error(`${failed} check(s) failed, ${warned} warning(s)`);
    return { success: false, message: `${failed} check(s) failed`, data };
  }
  if (warned > 0) {
    warn(`${passed} passed, ${warned} warning(s)`);
    return { success: true, message: `${passed} passed, ${warned} warning(s)`, data };
  }
  success(`All ${passed} checks passed`);
  return { success: true, message: 'All checks passed', data };
}

function showRoutingReport(): CLIResult {
  header('Adaptive Routing');

  const storePath = path.join(os.homedir(), '.hackagent', 'model-performance.json');
  if (!existsSync(storePath)) {
    console.log();
    info('Adaptive routing has not collected any data yet.');
    return { success: true, message: 'No routing data' };
  }

  let raw: string;
  try {
    raw = readFileSync(storePath, 'utf-8');
  } catch {
    info('Adaptive routing has not collected any data yet.');
    return { success: true, message: 'No routing data' };
  }

  let parsed: { models?: Record<string, { attempts: number; successes: number; failures: number; timeouts: number; emaLatencyMs: number; consecutiveTimeouts: number; demotedUntil: number | null; lastAttempt: number | null; lastSuccess: number | null }> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    info('Routing data file is corrupted.');
    return { success: true, message: 'Corrupted routing data' };
  }

  const records = parsed.models ?? {};
  const entries = Object.entries(records).filter(([, r]) => r.attempts > 0);

  if (entries.length === 0) {
    console.log();
    info('No routing statistics available.');
    return { success: true, message: 'No routing statistics' };
  }

  const tracker = new ModelPerformanceTracker();

  console.log();
  dim('Persistence');
  console.log(`  Store: ${storePath}`);
  console.log(`  Loaded: Yes`);
  console.log(`  Models tracked: ${entries.length}`);
  console.log();

  const modelSpecs: ModelSpec[] = entries.map(([key]) => {
    const sep = key.indexOf('::');
    const provider = key.slice(0, sep);
    const model_id = key.slice(sep + 2);
    return {
      provider: provider as ModelSpec['provider'],
      model_id,
      capabilities: [],
      context_window: 4096,
      supports_json_mode: false,
      supports_tool_calling: false,
      typical_latency_ms: 1000,
      cost_per_1k_input: 0,
      cost_per_1k_output: 0,
    };
  });

  const ranked = tracker.getRanked(modelSpecs);

  dim('Ranked Models');
  console.log();

  for (let i = 0; i < ranked.length; i++) {
    const ms = ranked[i]!;
    const rec = tracker.getRecord(ms.provider, ms.model_id);
    if (!rec || rec.attempts === 0) continue;

    const demoted = rec.demotedUntil !== null && Date.now() < rec.demotedUntil;
    const sr = rec.attempts > 0 ? ((rec.successes / rec.attempts) * 100).toFixed(0) : '0';
    const lat = rec.emaLatencyMs > 0 ? `${(rec.emaLatencyMs / 1000).toFixed(1)}s` : 'N/A';

    success(`${i + 1}.`);
    labeled('  Provider', ms.provider);
    labeled('  Model', ms.model_id);
    console.log();

    console.log(`  Status: ${demoted ? 'Demoted' : 'Healthy'}`);
    console.log(`  Success Rate: ${sr}%`);
    console.log(`  EMA Latency: ${lat}`);
    console.log(`  Attempts: ${rec.attempts}`);
    console.log(`  Successes: ${rec.successes}`);
    console.log(`  Timeouts: ${rec.timeouts}`);
    if (demoted && rec.demotedUntil) {
      const until = new Date(rec.demotedUntil);
      console.log(`  Demoted Until: ${formatDate(until)}`);
    } else {
      console.log(`  Demoted: No`);
    }
    console.log();
  }

  const best = ranked.find(ms => {
    const rec = tracker.getRecord(ms.provider, ms.model_id);
    return rec && rec.attempts > 0;
  });

  if (best) {
    dim('Summary');
    console.log();
    info('Current preferred model:');
    console.log(`  ${best.model_id}`);
    console.log();
    dim('Reason:');
    console.log('');
    const hasSuccess = entries.some(([, r]) => r.successes > 0);
    if (hasSuccess) {
      console.log('  - highest success rate');
      console.log('  - lowest effective latency');
      console.log('  - not currently demoted');
    }
  }

  return { success: true, message: 'Routing diagnostics complete' };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}
