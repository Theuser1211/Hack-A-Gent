import type {
  TestPlan,
  TestStep,
  TestStepResult,
  ScreenshotArtifact,
  DomSnapshot,
  ConsoleLogArtifact,
  NetworkArtifact,
  BrowserTestResult,
} from './test-types.js';

export interface TestProvider {
  readonly providerId: string;

  initialize(): Promise<void>;
  launchApplication(path: string, port?: number): Promise<void>;
  openBrowser(url: string): Promise<void>;
  executeStep(step: TestStep): Promise<TestStepResult>;
  captureScreenshot(name: string, stepId?: string): Promise<ScreenshotArtifact>;
  captureDomSnapshot(stepId?: string): Promise<DomSnapshot>;
  getConsoleLogs(): Promise<ConsoleLogArtifact[]>;
  getNetworkArtifacts(): Promise<NetworkArtifact[]>;
  executeTestPlan(plan: TestPlan): Promise<BrowserTestResult>;
  close(): Promise<void>;
}

export class MockTestProvider implements TestProvider {
  public readonly providerId: string = 'mock-test';

  private consoleLogs: ConsoleLogArtifact[] = [];
  private networkArtifacts: NetworkArtifact[] = [];
  private launched: boolean = false;
  private opened: boolean = false;

  async initialize(): Promise<void> {
    // no-op
  }

  async launchApplication(path: string, _port?: number): Promise<void> {
    if (!path) throw new Error('Path is required');
    this.launched = true;
  }

  async openBrowser(url: string): Promise<void> {
    if (!url) throw new Error('URL is required');
    this.opened = true;
    this.consoleLogs = [];
    this.networkArtifacts = [];
  }

  async executeStep(step: TestStep): Promise<TestStepResult> {
    const startTime = Date.now();

    if (!this.opened) {
      return {
        step,
        passed: false,
        assertions: [],
        console_logs: [],
        network_artifacts: [],
        error: 'Browser not opened',
        duration_ms: Date.now() - startTime,
      };
    }

    const isFailureTrigged =
      step.url?.includes('nonexistent') ||
      step.url?.includes('error') ||
      step.selector?.includes('nonexistent') ||
      step.assertions.some((a) => !a.passed);
    const passed = !isFailureTrigged;
    const assertions =
      step.assertions.length > 0
        ? step.assertions
        : [
            {
              type: 'text_visible' as const,
              expected: true,
              passed,
              message: passed ? 'Step executed' : 'Step failed',
              actual: passed,
            },
          ];

    const consoleLogs: ConsoleLogArtifact[] = [];
    const networkArtifacts: NetworkArtifact[] = [];

    if (!passed) {
      consoleLogs.push({
        level: 'error',
        message: `Mock error on step ${step.id}`,
        source: 'browser',
        timestamp: new Date().toISOString(),
        stack: undefined,
        step_id: step.id,
      });
      networkArtifacts.push({
        url: `http://localhost/${step.id}`,
        method: 'GET',
        status_code: 500,
        duration_ms: 100,
        success: false,
        error: 'Internal Server Error',
        timestamp: new Date().toISOString(),
        step_id: step.id,
      });
    }

    this.consoleLogs.push(...consoleLogs);
    this.networkArtifacts.push(...networkArtifacts);

    return {
      step,
      passed,
      assertions,
      console_logs: consoleLogs,
      network_artifacts: networkArtifacts,
      error: passed ? undefined : `Mock failure on step ${step.id}`,
      duration_ms: Date.now() - startTime,
    };
  }

  async captureScreenshot(name: string, stepId?: string): Promise<ScreenshotArtifact> {
    return {
      name,
      data_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      mime_type: 'image/png',
      captured_at: new Date().toISOString(),
      viewport: { width: 1280, height: 720 },
      step_id: stepId,
    };
  }

  async captureDomSnapshot(stepId?: string): Promise<DomSnapshot> {
    return {
      url: 'http://localhost:3000',
      title: 'Mock Page',
      html: '<html><body><h1>Mock</h1></body></html>',
      captured_at: new Date().toISOString(),
      viewport: { width: 1280, height: 720 },
      step_id: stepId,
    };
  }

  async getConsoleLogs(): Promise<ConsoleLogArtifact[]> {
    return [...this.consoleLogs];
  }

  async getNetworkArtifacts(): Promise<NetworkArtifact[]> {
    return [...this.networkArtifacts];
  }

  async executeTestPlan(plan: TestPlan): Promise<BrowserTestResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    await this.launchApplication('.');
    await this.openBrowser(plan.base_url);

    const allConsoleLogs: ConsoleLogArtifact[] = [];
    const allNetworkArtifacts: NetworkArtifact[] = [];
    const allScreenshots: ScreenshotArtifact[] = [];
    const allDomSnapshots: DomSnapshot[] = [];
    const failures: BrowserTestResult['failures'] = [];
    let passedSteps = 0;
    let failedSteps = 0;
    const skippedSteps = 0;

    for (const step of plan.steps) {
      const result = await this.executeStep(step);
      if (result.passed) {
        passedSteps++;
      } else {
        failedSteps++;
        failures.push({
          step_id: step.id,
          step_description: step.description,
          error_type: 'assertion',
          message: result.error ?? 'Unknown error',
          console_errors: result.console_logs,
          network_errors: result.network_artifacts,
          timestamp: new Date().toISOString(),
        });
        allConsoleLogs.push(...result.console_logs);
        allNetworkArtifacts.push(...result.network_artifacts);
      }

      allConsoleLogs.push(...result.console_logs);
      allNetworkArtifacts.push(...result.network_artifacts);

      if (plan.screenshots.includes(step.id)) {
        allScreenshots.push(await this.captureScreenshot(`step-${step.id}`, step.id));
        allDomSnapshots.push(await this.captureDomSnapshot(step.id));
      }
    }

    const passed = failedSteps === 0;

    return {
      plan_name: plan.name,
      base_url: plan.base_url,
      passed,
      total_steps: plan.steps.length,
      passed_steps: passedSteps,
      failed_steps: failedSteps,
      skipped_steps: skippedSteps,
      failures,
      screenshots: allScreenshots,
      console_logs: allConsoleLogs,
      network_artifacts: allNetworkArtifacts,
      dom_snapshots: allDomSnapshots,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    };
  }

  async close(): Promise<void> {
    this.launched = false;
    this.opened = false;
    this.consoleLogs = [];
    this.networkArtifacts = [];
  }
}
