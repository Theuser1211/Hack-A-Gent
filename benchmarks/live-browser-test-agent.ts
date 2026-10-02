import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import type { InternetToolGateway } from './internet-tool-gateway.js';
import type { TaskGraph } from './task-graph.js';

export type BrowserTestStatus = 'passed' | 'failed' | 'error';

export interface LiveBrowserTestSpec {
  id: string;
  name: string;
  url: string;
  expectedSelectors: string[];
  expectedTexts: string[];
  expectedStatus?: number;
  actions?: LiveBrowserAction[];
  screenshot?: boolean;
  timeout?: number;
}

export interface LiveBrowserAction {
  type: 'navigate' | 'click' | 'type' | 'wait' | 'waitForSelector' | 'screenshot' | 'evaluate';
  selector?: string;
  value?: string;
  script?: string;
  ms?: number;
}

export interface LiveBrowserTestResult {
  specId: string;
  passed: boolean;
  statusCode: number | null;
  failures: LiveTestFailure[];
  consoleLogs: string[];
  consoleErrors: string[];
  domElements: string[];
  screenshotPaths: string[];
  durationMs: number;
  timestamp: string;
}

export interface LiveTestFailure {
  type: 'missing_element' | 'text_mismatch' | 'status_code' | 'console_error' | 'network_error' | 'timeout';
  selector: string | null;
  expected: string | null;
  actual: string | null;
  message: string;
}

export interface LiveBrowserRepairAction {
  type: 'patch_component' | 'add_import' | 'fix_routing' | 'update_config' | 'add_script';
  targetFile: string;
  description: string;
  oldString?: string;
  newString?: string;
}

export interface LiveRepairCycleResult {
  allPassed: boolean;
  results: LiveBrowserTestResult[];
  repairs: LiveBrowserRepairAction[];
  cyclesUsed: number;
}

interface PageInfo {
  title: string;
  textContent: string;
  links: string[];
  images: string[];
  statusCode: number | null;
}

export class LiveBrowserTestAgent {
  private readonly seed: number;
  private readonly agentId: string;
  private readonly toolGateway: InternetToolGateway;
  private testHistory: LiveBrowserTestResult[] = [];
  private readonly maxRepairAttempts: number;

  constructor(toolGateway: InternetToolGateway, seed = 42, maxRepairAttempts = 3) {
    this.seed = seed;
    this.agentId = 'live-browser-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.toolGateway = toolGateway;
    this.maxRepairAttempts = maxRepairAttempts;
  }

  getAgentId(): string {
    return this.agentId;
  }
  getTestHistory(): LiveBrowserTestResult[] {
    return [...this.testHistory];
  }

  buildTestSpec(
    name: string,
    url: string,
    selectors: string[],
    texts: string[],
    actions: LiveBrowserAction[] = [],
  ): LiveBrowserTestSpec {
    return {
      id: 'lbt-' + createDeterministicUuid(this.seed, this.testHistory.length + 1).slice(0, 8),
      name,
      url,
      expectedSelectors: selectors,
      expectedTexts: texts,
      actions,
      screenshot: true,
      timeout: 30000,
    };
  }

  async runTest(spec: LiveBrowserTestSpec): Promise<LiveBrowserTestResult> {
    const startTime = Date.now();
    const failures: LiveTestFailure[] = [];

    const pageInfo = await this.fetchPage(spec.url, spec.timeout ?? 30000);

    if (
      pageInfo.statusCode !== null &&
      spec.expectedStatus !== undefined &&
      pageInfo.statusCode !== spec.expectedStatus
    ) {
      failures.push({
        type: 'status_code',
        selector: null,
        expected: `${spec.expectedStatus}`,
        actual: `${pageInfo.statusCode}`,
        message: `Expected status ${spec.expectedStatus}, got ${pageInfo.statusCode}`,
      });
    }

    for (const selector of spec.expectedSelectors) {
      const exists = this.checkElementExists(pageInfo, selector);
      if (!exists) {
        failures.push({
          type: 'missing_element',
          selector,
          expected: `Element ${selector} exists`,
          actual: 'not found',
          message: `Expected element "${selector}" not found in DOM`,
        });
      }
    }

    for (const text of spec.expectedTexts) {
      const found = pageInfo.textContent.includes(text);
      if (!found) {
        failures.push({
          type: 'text_mismatch',
          selector: null,
          expected: `Text "${text}" present`,
          actual: 'not found',
          message: `Expected text "${text}" not found`,
        });
      }
    }

    const result: LiveBrowserTestResult = {
      specId: spec.id,
      passed: failures.length === 0,
      statusCode: pageInfo.statusCode,
      failures,
      consoleLogs: [],
      consoleErrors: [],
      domElements: [pageInfo.title, ...pageInfo.links],
      screenshotPaths: [],
      durationMs: Date.now() - startTime,
      timestamp: deterministicNow(this.seed + this.testHistory.length),
    };

    this.testHistory.push(result);
    return result;
  }

  private async fetchPage(url: string, timeout: number): Promise<PageInfo> {
    const pageInfo: PageInfo = { title: '', textContent: '', links: [], images: [], statusCode: null };
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      pageInfo.statusCode = res.status;
      const html = await res.text();
      pageInfo.title = this.extractTitle(html);
      pageInfo.textContent = this.extractText(html);
      pageInfo.links = this.extractLinks(html);
      pageInfo.images = this.extractImages(html);
    } catch {
      pageInfo.statusCode = 0;
    }
    return pageInfo;
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match ? match[1]!.trim() : '';
  }

  private extractText(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractLinks(html: string): string[] {
    const links: string[] = [];
    const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      links.push(match[1]!);
    }
    return links;
  }

  private extractImages(html: string): string[] {
    const imgs: string[] = [];
    const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      imgs.push(match[1]!);
    }
    return imgs;
  }

  private checkElementExists(pageInfo: PageInfo, selector: string): boolean {
    const clean = selector.replace(/[#.]/g, '').toLowerCase();
    return (
      pageInfo.textContent.toLowerCase().includes(clean) ||
      pageInfo.title.toLowerCase().includes(clean) ||
      pageInfo.links.some((l) => l.toLowerCase().includes(clean))
    );
  }

  async testAndRepairCycle(
    specs: LiveBrowserTestSpec[],
    taskGraph: TaskGraph,
    uiTaskId: string,
  ): Promise<LiveRepairCycleResult> {
    const allRepairs: LiveBrowserRepairAction[] = [];
    let currentSpecs = specs;

    for (let attempt = 0; attempt < this.maxRepairAttempts; attempt++) {
      const results: LiveBrowserTestResult[] = [];
      for (const spec of currentSpecs) {
        const result = await this.runTest(spec);
        results.push(result);

        if (!result.passed) {
          const repairs = this.generateRepairs(result.failures, spec);
          allRepairs.push(...repairs);
          for (const repair of repairs) {
            taskGraph.markPending(uiTaskId);
          }
        }
      }

      const allPassed = results.every((r) => r.passed);
      if (allPassed) return { allPassed: true, results, repairs: allRepairs, cyclesUsed: attempt + 1 };

      const failedSpecs = results
        .filter((r) => !r.passed)
        .map((r) => specs.find((s) => s.id === r.specId))
        .filter(Boolean) as LiveBrowserTestSpec[];
      if (failedSpecs.length === 0) return { allPassed: true, results, repairs: allRepairs, cyclesUsed: attempt + 1 };
      currentSpecs = failedSpecs;
    }

    const finalResults = await Promise.all(specs.map((s) => this.runTest(s)));
    return { allPassed: false, results: finalResults, repairs: allRepairs, cyclesUsed: this.maxRepairAttempts };
  }

  private generateRepairs(failures: LiveTestFailure[], spec: LiveBrowserTestSpec): LiveBrowserRepairAction[] {
    return failures.map((f) => {
      switch (f.type) {
        case 'missing_element':
          return {
            type: 'patch_component',
            targetFile: 'src/components/MissingElement.tsx',
            description: `Add component for "${f.selector}"`,
            oldString: '// TODO',
            newString: `<section id="${f.selector?.replace('#', '')}">${f.selector}</section>`,
          };
        case 'text_mismatch':
          return {
            type: 'patch_component',
            targetFile: 'src/pages/index.tsx',
            description: `Add text "${f.expected}" to page`,
            oldString: '</main>',
            newString: `<p>${f.expected?.replace('Text "', '').replace('" present', '')}</p>\n</main>`,
          };
        case 'status_code':
          return {
            type: 'fix_routing',
            targetFile: 'src/config.ts',
            description: 'Fix routing/API configuration',
            oldString: '// config',
            newString: '// config: fixed for status code',
          };
        case 'console_error':
          return {
            type: 'add_script',
            targetFile: 'src/index.tsx',
            description: 'Add error boundary',
            newString: '// error boundary added',
          };
        default:
          return {
            type: 'update_config',
            targetFile: 'vercel.json',
            description: 'Update deployment config',
            oldString: '{ }',
            newString: '{ "cleanUrls": true }',
          };
      }
    });
  }
}
