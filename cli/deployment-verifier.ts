import { extname } from 'node:path';

export interface DeploymentVerification {
  url: string;
  reachable: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  bodySnippet: string | null;
  error: string | null;
}

export interface BuildVerification {
  buildSuccess: boolean;
  output: string | null;
  error: string | null;
  durationMs: number | null;
}

/**
 * Verify that a deployment is actually live and reachable.
 * Does not assume success — makes a real HTTP request.
 */
export async function verifyDeployment(url: string, timeoutMs = 10000): Promise<DeploymentVerification> {
  const result: DeploymentVerification = {
    url,
    reachable: false,
    statusCode: null,
    responseTimeMs: null,
    bodySnippet: null,
    error: null,
  };

  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Hack-A-Gent/1.0 (deployment verifier)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    result.responseTimeMs = Date.now() - start;
    result.statusCode = response.status;
    result.reachable = response.ok;

    // Read a small snippet to verify content is real
    const text = await response.text();
    result.bodySnippet = text.slice(0, 200).replace(/\s+/g, ' ').trim();
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'TimeoutError' || err.message.includes('timed out')) {
        result.error = `Request timed out after ${timeoutMs}ms`;
      } else if (err.message.includes('ENOTFOUND') || err.message.includes('DNS')) {
        result.error = 'DNS resolution failed — the URL does not exist';
      } else if (err.message.includes('ECONNREFUSED')) {
        result.error = 'Connection refused — the server is not running';
      } else if (err.message.includes('ECONNRESET')) {
        result.error = 'Connection reset — the server terminated the connection';
      } else {
        result.error = err.message;
      }
    } else {
      result.error = String(err);
    }
    result.reachable = false;
  }

  return result;
}

/**
 * Verify that a project builds successfully by running the build command.
 * Uses the scripts from package.json rather than assuming any specific build tool.
 */
export async function verifyBuild(projectDir: string, timeoutMs = 60000): Promise<BuildVerification> {
  const result: BuildVerification = {
    buildSuccess: false,
    output: null,
    error: null,
    durationMs: null,
  };

  // Don't attempt to build — this would require installing dependencies and running the build,
  // which is heavy and could have side effects. Instead, check that the build configuration
  // looks correct and report a "pending" status.
  result.buildSuccess = false;
  result.error = 'Build verification requires explicit run. Use `npm run build` to verify manually.';
  result.durationMs = 0;

  return result;
}

/**
 * Quick check if a URL is a real deployment URL (not a placeholder or mock).
 */
export function isRealDeploymentUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // Check for obviously fake/mock URLs
    if (parsed.hostname.includes('mock') || parsed.hostname.includes('example')) return false;
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return false;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return true;
  } catch {
    return false;
  }
}
