/**
 * Enhanced Browser Validator
 *
 * Goes beyond HTTP 200 to verify the app actually renders correctly.
 * Checks HTML structure, key elements, and basic functionality.
 */

import * as http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BrowserValidationResult {
  success: boolean;
  serverStarted: boolean;
  http200: boolean;
  hasContent: boolean;
  hasTitle: boolean;
  hasHeadings: boolean;
  hasInteractiveElements: boolean;
  htmlLength: number;
  title?: string;
  headings: string[];
  errors: string[];
  duration: number;
}

export interface BrowserValidatorOptions {
  port?: number;
  timeout?: number;
  contentChecks?: string[];
}

/**
 * Extract meaningful content from HTML.
 */
function analyzeHtml(html: string): {
  title: string | null;
  headings: string[];
  hasForms: boolean;
  hasButtons: boolean;
  hasLinks: boolean;
  hasImages: boolean;
  hasScripts: boolean;
  textLength: number;
} {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch ? titleMatch[1]!.trim() : null;

  const headings: string[] = [];
  const headingMatches = html.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis);
  for (const m of headingMatches) {
    const text = m[1]!.replace(/<[^>]+>/g, '').trim();
    if (text) headings.push(text);
  }

  return {
    title,
    headings,
    hasForms: /<form[\s>]/i.test(html),
    hasButtons: /<button[\s>]/i.test(html) || /type=["']submit["']/i.test(html),
    hasLinks: /<a[\s>]/i.test(html),
    hasImages: /<img[\s>]/i.test(html),
    hasScripts: /<script[\s>]/i.test(html),
    textLength: html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length,
  };
}

/**
 * Check if HTML contains expected content.
 */
function checkContent(html: string, checks: string[]): string[] {
  const failures: string[] = [];
  for (const check of checks) {
    if (!html.toLowerCase().includes(check.toLowerCase())) {
      failures.push(`Missing expected content: "${check}"`);
    }
  }
  return failures;
}

/**
 * Start dev server and validate the app.
 */
export async function validateWithBrowser(
  projectDir: string,
  options: BrowserValidatorOptions = {},
): Promise<BrowserValidationResult> {
  const startTime = Date.now();
  const port = options.port ?? 3099;
  const timeout = options.timeout ?? 30000;

  const result: BrowserValidationResult = {
    success: false,
    serverStarted: false,
    http200: false,
    hasContent: false,
    hasTitle: false,
    hasHeadings: false,
    hasInteractiveElements: false,
    htmlLength: 0,
    headings: [],
    errors: [],
    duration: 0,
  };

  // Check prerequisites
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    result.errors.push('No package.json');
    result.duration = Date.now() - startTime;
    return result;
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    result.errors.push('Cannot read package.json');
    result.duration = Date.now() - startTime;
    return result;
  }

  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!scripts?.dev) {
    result.errors.push('No dev script in package.json');
    result.duration = Date.now() - startTime;
    return result;
  }

  // Install dependencies if needed
  const nodeModules = path.join(projectDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    try {
      const { execSync } = await import('node:child_process');
      execSync('npm install --legacy-peer-deps', {
        cwd: projectDir,
        stdio: 'pipe',
        timeout: 120000,
        windowsHide: true,
      });
    } catch {
      result.errors.push('npm install failed');
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  // Start dev server
  const server = spawn('npm', ['run', 'dev'], {
    cwd: projectDir,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: String(port) },
  });

  return new Promise<BrowserValidationResult>((resolve) => {
    const timer = setTimeout(() => {
      server.kill();
      result.errors.push(result.serverStarted ? 'Timeout waiting for response' : 'Server did not start');
      result.duration = Date.now() - startTime;
      resolve(result);
    }, timeout);

    let output = '';

    server.stdout?.on('data', (data: Buffer) => {
      output += data.toString();

      if (!result.serverStarted && (
        output.includes('Ready in') ||
        output.includes('started on') ||
        output.includes('listening on') ||
        output.includes(`localhost:${port}`)
      )) {
        result.serverStarted = true;

        // Fetch the page
        const req = http.get(`http://localhost:${port}`, (res: http.IncomingMessage) => {
          if (res.statusCode === 200) {
            result.http200 = true;

            let body = '';
            res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            res.on('end', () => {
              result.htmlLength = body.length;

              // Analyze HTML content
              const analysis = analyzeHtml(body);
              result.title = analysis.title ?? undefined;
              result.headings = analysis.headings;
              result.hasTitle = !!analysis.title;
              result.hasHeadings = analysis.headings.length > 0;
              result.hasInteractiveElements = analysis.hasForms || analysis.hasButtons;
              result.hasContent = analysis.textLength > 50;

              // Content checks
              if (options.contentChecks) {
                const contentFailures = checkContent(body, options.contentChecks);
                result.errors.push(...contentFailures);
              }

              result.success = result.http200 && result.hasContent && result.errors.length === 0;

              clearTimeout(timer);
              server.kill();
              result.duration = Date.now() - startTime;
              resolve(result);
            });
          } else {
            result.errors.push(`HTTP ${res.statusCode}`);
            clearTimeout(timer);
            server.kill();
            result.duration = Date.now() - startTime;
            resolve(result);
          }
        });

        req.on('error', (e: Error) => {
          result.errors.push(e.message);
          clearTimeout(timer);
          server.kill();
          result.duration = Date.now() - startTime;
          resolve(result);
        });

        req.setTimeout(5000, () => { req.destroy(); });
      }
    });

    server.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    server.on('error', (err: Error) => {
      result.errors.push(err.message);
      clearTimeout(timer);
      result.duration = Date.now() - startTime;
      resolve(result);
    });

    server.on('close', () => {
      clearTimeout(timer);
      if (!result.success) {
        result.duration = Date.now() - startTime;
        resolve(result);
      }
    });
  });
}

/**
 * Format browser validation result for CLI display.
 */
export function formatBrowserResult(result: BrowserValidationResult): string {
  const lines: string[] = [];
  const icon = result.success ? '✅' : '❌';

  lines.push(`${icon} Browser Validation: ${result.success ? 'PASSED' : 'FAILED'}`);
  lines.push(`   Server started: ${result.serverStarted ? '✅' : '❌'}`);
  lines.push(`   HTTP 200:       ${result.http200 ? '✅' : '❌'}`);
  lines.push(`   Has content:    ${result.hasContent ? '✅' : '❌'} (${result.htmlLength} bytes)`);
  lines.push(`   Has title:      ${result.hasTitle ? '✅' : '❌'} ${result.title ? `("${result.title}")` : ''}`);
  lines.push(`   Has headings:   ${result.hasHeadings ? '✅' : '❌'} (${result.headings.length})`);
  lines.push(`   Interactive:    ${result.hasInteractiveElements ? '✅' : '❌'}`);
  lines.push(`   Duration:       ${(result.duration / 1000).toFixed(1)}s`);

  if (result.headings.length > 0) {
    lines.push(`   Headings: ${result.headings.slice(0, 3).join(', ')}`);
  }

  if (result.errors.length > 0) {
    lines.push('   Errors:');
    for (const e of result.errors.slice(0, 5)) {
      lines.push(`     • ${e}`);
    }
  }

  return lines.join('\n');
}
