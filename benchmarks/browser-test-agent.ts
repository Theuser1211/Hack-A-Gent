import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import type { TaskGraph } from './task-graph.js';
import type { ToolExecutor } from './tool-executor.js';

export type BrowserTestStatus = 'passed' | 'failed' | 'error' | 'running';

export interface BrowserTestSpec {
  id: string;
  name: string;
  description: string;
  url: string;
  actions: BrowserAction[];
  expectedSelectors: string[];
  expectedText: string[];
  screenshot: boolean;
  timeout: number;
}

export type BrowserAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; value: string }
  | { type: 'select'; selector: string; value: string }
  | { type: 'wait'; ms: number }
  | { type: 'waitForSelector'; selector: string }
  | { type: 'screenshot'; name: string }
  | { type: 'evaluate'; script: string };

export interface BrowserTestResult {
  specId: string;
  passed: boolean;
  failures: BrowserTestFailure[];
  consoleLogs: string[];
  consoleErrors: string[];
  networkErrors: string[];
  domErrors: string[];
  screenshotPaths: string[];
  durationMs: number;
  timestamp: string;
}

export interface BrowserTestFailure {
  type: 'missing_element' | 'text_mismatch' | 'console_error' | 'network_error' | 'timeout' | 'dom_error' | 'assertion';
  selector: string | null;
  expected: string | null;
  actual: string | null;
  message: string;
}

export interface RepairAction {
  type: 'patch_component' | 'add_import' | 'fix_routing' | 'update_config' | 'add_script' | 'fix_stylesheet';
  targetFile: string;
  description: string;
  patch: { oldString: string; newString: string } | null;
}

export class BrowserTestAgent {
  private readonly seed: number;
  private readonly agentId: string;
  private readonly toolExecutor: ToolExecutor;
  private testHistory: BrowserTestResult[] = [];
  private repairAttempts = 0;
  private readonly maxRepairAttempts: number;

  constructor(toolExecutor: ToolExecutor, seed = 42, maxRepairAttempts = 3) {
    this.seed = seed;
    this.agentId = 'browser-test-agent-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.toolExecutor = toolExecutor;
    this.maxRepairAttempts = maxRepairAttempts;
  }

  getAgentId(): string {
    return this.agentId;
  }
  getTestHistory(): BrowserTestResult[] {
    return [...this.testHistory];
  }
  getRepairAttempts(): number {
    return this.repairAttempts;
  }

  async runTest(spec: BrowserTestSpec): Promise<BrowserTestResult> {
    const startTime = Date.now();
    const failures: BrowserTestFailure[] = [];

    const navResult = await this.toolExecutor.execute('browser_test', 'navigate', { url: spec.url });
    if (!navResult.success) {
      failures.push({
        type: 'network_error',
        selector: null,
        expected: spec.url,
        actual: navResult.error,
        message: 'Navigation failed: ' + navResult.error,
      });
    }

    for (const action of spec.actions) {
      const r = await this.executeAction(action);
      if (!r.success) {
        failures.push({
          type: 'dom_error',
          selector: ('selector' in action ? action.selector : null) as string | null,
          expected: null,
          actual: r.error,
          message: 'Action ' + action.type + ' failed: ' + r.error,
        });
      }
    }

    for (const selector of spec.expectedSelectors) {
      const exists = await this.checkSelectorExists(selector);
      if (!exists) {
        failures.push({
          type: 'missing_element',
          selector,
          expected: 'Element should exist',
          actual: 'not found',
          message: 'Expected element ' + selector + ' not found',
        });
      }
    }

    for (const text of spec.expectedText) {
      const found = await this.checkTextExists(text);
      if (!found) {
        failures.push({
          type: 'text_mismatch',
          selector: null,
          expected: 'Text should be present: ' + text,
          actual: 'not found',
          message: 'Expected text not found: ' + text,
        });
      }
    }

    const captureResult = await this.toolExecutor.execute('browser_test', 'capture', {
      url: spec.url,
      screenshot: spec.screenshot,
    });
    const captureData = (captureResult.success ? captureResult.output : {}) as Record<string, unknown>;

    const result: BrowserTestResult = {
      specId: spec.id,
      passed: failures.length === 0,
      failures,
      consoleLogs: (captureData.consoleLogs as string[]) ?? [],
      consoleErrors: (captureData.consoleErrors as string[]) ?? [],
      networkErrors: (captureData.networkErrors as string[]) ?? [],
      domErrors: (captureData.domErrors as string[]) ?? [],
      screenshotPaths: (captureData.screenshots as string[]) ?? [],
      durationMs: Date.now() - startTime,
      timestamp: deterministicNow(this.seed + this.testHistory.length),
    };
    this.testHistory.push(result);
    return result;
  }

  private async executeAction(action: BrowserAction): Promise<{ success: boolean; error: string | null }> {
    const r = await this.toolExecutor.execute(
      'browser_test',
      action.type,
      action as unknown as Record<string, unknown>,
    );
    return { success: r.success, error: r.error };
  }

  private async checkSelectorExists(selector: string): Promise<boolean> {
    const result = await this.toolExecutor.execute('browser_test', 'checkSelector', { selector });
    return result.success && (result.output as Record<string, unknown>)?.exists === true;
  }

  private async checkTextExists(text: string): Promise<boolean> {
    const result = await this.toolExecutor.execute('browser_test', 'checkText', { text });
    return result.success && (result.output as Record<string, unknown>)?.found === true;
  }

  async testAndRepairCycle(
    specs: BrowserTestSpec[],
    taskGraph: TaskGraph,
    uiTaskId: string,
  ): Promise<{ allPassed: boolean; results: BrowserTestResult[]; repairs: RepairAction[] }> {
    this.repairAttempts = 0;
    const allRepairs: RepairAction[] = [];
    let currentSpecs = specs;

    while (this.repairAttempts < this.maxRepairAttempts) {
      const results: BrowserTestResult[] = [];
      for (const spec of currentSpecs) {
        const result = await this.runTest(spec);
        results.push(result);
        if (!result.passed) {
          const diagnosis = this.diagnoseFailures(result);
          const diagId = 'diag-' + createDeterministicUuid(this.seed, this.repairAttempts).slice(0, 6);
          taskGraph.markRunning(taskGraph.addNode('Diagnose: ' + spec.name, 'testing', [spec.id]));
          const repairs = this.generateRepairs(diagnosis, spec);
          allRepairs.push(...repairs);
          for (const repair of repairs) {
            await this.applyRepair(repair);
            taskGraph.addArtifact(uiTaskId, 'Repair: ' + repair.description);
          }
        }
      }

      this.repairAttempts++;
      const allPassed = results.every((r) => r.passed);
      if (allPassed) return { allPassed: true, results, repairs: allRepairs };
      currentSpecs = results.filter((r) => !r.passed).map((r) => specs.find((s) => s.id === r.specId)!);
    }

    const finalResults = await Promise.all(specs.map((s) => this.runTest(s)));
    return { allPassed: false, results: finalResults, repairs: allRepairs };
  }

  private diagnoseFailures(result: BrowserTestResult): BrowserTestFailure[] {
    return result.failures.map((f) => {
      switch (f.type) {
        case 'missing_element':
          return { ...f, message: 'UI component not rendered - missing import or route' };
        case 'console_error':
          return { ...f, message: 'Runtime error: ' + f.message };
        case 'network_error':
          return { ...f, message: 'Network failure - check endpoints or build' };
        default:
          return f;
      }
    });
  }

  private generateRepairs(failures: BrowserTestFailure[], spec: BrowserTestSpec): RepairAction[] {
    const repairs: RepairAction[] = [];
    for (const f of failures) {
      switch (f.type) {
        case 'missing_element':
          repairs.push({
            type: 'patch_component',
            targetFile: 'src/components/' + (f.selector?.replace(/[#.]/g, '') ?? 'Unknown') + '.tsx',
            description: 'Add missing component for selector: ' + f.selector,
            patch: null,
          });
          break;
        case 'console_error':
          repairs.push({
            type: 'fix_routing',
            targetFile: 'src/App.tsx',
            description: 'Fix route configuration for page',
            patch: null,
          });
          break;
        case 'network_error':
          repairs.push({
            type: 'update_config',
            targetFile: 'src/config.ts',
            description: 'Update API endpoint configuration',
            patch: null,
          });
          break;
        case 'text_mismatch':
          repairs.push({
            type: 'patch_component',
            targetFile: 'src/pages/index.tsx',
            description: 'Update page content to include expected text',
            patch: null,
          });
          break;
        default:
          repairs.push({
            type: 'patch_component',
            targetFile: 'src/App.tsx',
            description: 'General UI fix',
            patch: null,
          });
      }
    }
    return repairs;
  }

  private async applyRepair(repair: RepairAction): Promise<void> {
    await this.toolExecutor.execute('file', 'patch', {
      path: repair.targetFile,
      oldString: repair.patch?.oldString ?? '',
      newString: repair.patch?.newString ?? '',
      append: repair.patch === null ? '// TODO: ' + repair.description : undefined,
    });
  }

  buildTestSpec(
    name: string,
    url: string,
    selectors: string[],
    textChecks: string[],
    actions: BrowserAction[] = [],
  ): BrowserTestSpec {
    return {
      id: 'test-' + createDeterministicUuid(this.seed, this.testHistory.length + 1).slice(0, 8),
      name,
      description: 'Browser test: ' + name,
      url,
      actions,
      expectedSelectors: selectors,
      expectedText: textChecks,
      screenshot: true,
      timeout: 30000,
    };
  }
}
