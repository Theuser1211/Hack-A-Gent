import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { getConfig } from '../config-manager.js';
import { initializeProviders } from '../provider-init.js';
import { header, success, error, warn } from '../output.js';

interface CheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export async function doctorCommand(_ctx: CLIContext, _args: CLIArgs): Promise<CLIResult> {
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
    const icon = check.status === 'pass' ? '✔' : check.status === 'warn' ? '⚠' : '✘';
    console.log(`  ${icon} ${check.name}: ${check.message}`);
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const warned = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  console.log();

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
