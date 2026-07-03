import type { Task, TaskResult } from '../kernel/tasks/task-entity.js';
import type { Agent } from '../kernel/agents/agent-runtime.js';
import type { AgentManifest } from '../kernel/agents/agent-manifest.js';
import type { MemoryWriter } from '../kernel/memory/memory-writer.js';
import type { EventBus } from '../kernel/events/event-bus.js';
import { createEvent } from '../kernel/events/event-envelope.js';
import type { TestProvider } from '../kernel/test/test-provider.js';
import type {
  TestPlan, TestStep, BrowserTestResult, TestReport, TestFailure,
  ScreenshotArtifact, ConsoleLogArtifact, NetworkArtifact,
} from '../kernel/test/test-types.js';
import { TestReportSchema } from '../kernel/test/test-types.js';

export interface PlaywrightTestConfig {
  provider: TestProvider;
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
}

export class PlaywrightTestAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly provider: TestProvider;
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;

  constructor(config: PlaywrightTestConfig) {
    this.provider = config.provider;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;

    this.manifest = {
      agent_id: config.agentId ?? 'agent.test.playwright.v1',
      agent_name: 'Playwright Test V1',
      agent_type: 'execution',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'browser_testing',
          description: 'Launches generated applications, runs browser-based test plans, captures screenshots, console errors, network failures, and DOM snapshots, produces structured test reports',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: ['TypeScript', 'Playwright', 'Browser Automation', 'Web Technologies'],
      event_subscriptions: ['BUILD_COMPLETED'],
      accepted_tasks: ['testing'],
      produced_outputs: [
        {
          output_id: 'test_report',
          description: 'Structured test report with browser test results, screenshots, console logs, network artifacts, and filed bugs',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.test.playwright.v1/output/{task_id}-test-report.json',
        },
      ],
      accessible_tools: [
        { tool_name: 'tool.filesystem', access_level: 'read' },
      ],
      accessible_memories: [
        { file: 'AGENT_LOG.md', access: 'append' },
        { file: 'BUGS.md', access: 'append' },
        { file: 'DECISIONS.md', access: 'append' },
      ],
      escalation_rules: [
        {
          condition: 'invalid_input',
          action: 'request_human_checkpoint',
          message: 'Playwright test agent needs a valid test plan with base_url and steps',
        },
        {
          condition: 'tool_failure',
          action: 'emit_error_event',
          message: 'Browser automation failed — check that the application is running and accessible',
        },
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Testing exceeded max retries, partial results returned',
        },
      ],
      timeout_ms: 600000,
      max_retries: 2,
    };
  }

  async onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === 'BUILD_COMPLETED') {
      await this.log('partial', `Received BUILD_COMPLETED: ${JSON.stringify(event.payload)}`);
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const startedAt = Date.now();
    const startedAtISO = new Date(startedAt).toISOString();

    const plan = this.parseInput(task);
    const projectName = plan?.name ?? 'unknown';

    await this.log('partial', `Starting browser testing for: ${projectName}`);
    await this.emitEvent('TESTING_STARTED', {
      task_id: task.task_id,
      project_name: projectName,
      test_plan: plan ? { name: plan.name, steps: plan.steps.length, base_url: plan.base_url } : null,
    });

    try {
      if (!plan) {
        throw new Error('Invalid or missing test plan');
      }

      await this.writeDecision({
        id: `dec-test-${task.task_id.slice(0, 8)}`,
        decision: `Running browser test plan "${plan.name}" against ${plan.base_url}`,
        context: `Test plan: ${plan.name}. Steps: ${plan.steps.length}. Base URL: ${plan.base_url}. Screenshots: ${plan.screenshots.length}.`,
        alternatives: [],
        rationale: 'Playwright test agent launches the application, opens a browser, executes each test step, captures artifacts on failure, and produces a structured report.',
        consequences: 'Any failures are filed as bugs in BUGS.md without automated fixes. Screenshots, DOM snapshots, console logs, and network artifacts are collected for each failure.',
      });

      await this.provider.initialize();
      await this.provider.launchApplication('.');
      await this.provider.openBrowser(plan.base_url);

      await this.emitEvent('PAGE_LOADED', {
        task_id: task.task_id,
        project_name: projectName,
        base_url: plan.base_url,
      });

      await this.log('partial', `Application launched and browser opened at ${plan.base_url}`);

      const allConsoleLogs: ConsoleLogArtifact[] = [];
      const allNetworkArtifacts: NetworkArtifact[] = [];
      const allScreenshots: ScreenshotArtifact[] = [];
      const bugsFiled: Array<{ id: string; description: string; severity: string }> = [];

      for (const step of plan.steps) {
        await this.log('partial', `Executing step ${step.id}: ${step.description}`);

        const result = await this.provider.executeStep(step);
        allConsoleLogs.push(...result.console_logs);
        allNetworkArtifacts.push(...result.network_artifacts);

        if (result.passed) {
          await this.log('success', `Step ${step.id} PASSED: ${step.description}`);
          await this.emitEvent('TEST_PASSED', {
            task_id: task.task_id,
            project_name: projectName,
            step_id: step.id,
            step_description: step.description,
            duration_ms: result.duration_ms,
          });
        } else {
          await this.log('failure', `Step ${step.id} FAILED: ${step.description} — ${result.error ?? 'Unknown error'}`);
          await this.emitEvent('TEST_FAILED', {
            task_id: task.task_id,
            project_name: projectName,
            step_id: step.id,
            step_description: step.description,
            error: result.error,
            duration_ms: result.duration_ms,
          });

          const screenshot = await this.provider.captureScreenshot(`failure-${step.id}`, step.id);
          allScreenshots.push(screenshot);

          await this.emitEvent('SCREENSHOT_CAPTURED', {
            task_id: task.task_id,
            project_name: projectName,
            screenshot_name: screenshot.name,
            step_id: step.id,
          });

          const bugId = `BUG-${task.task_id.slice(0, 4)}-${step.id}`;
          const consoleErrors = result.console_logs.filter((l) => l.level === 'error');
          const networkErrors = result.network_artifacts.filter((a) => !a.success);

          await this.fileBug(bugId, {
            stepId: step.id,
            stepDescription: step.description,
            error: result.error ?? 'Unknown failure',
            consoleErrors: consoleErrors.map((c) => c.message),
            networkErrors: networkErrors.map((n) => `${n.method} ${n.url} → ${n.status_code ?? 'N/A'}: ${n.error ?? 'N/A'}`),
          });

          bugsFiled.push({ id: bugId, description: step.description, severity: consoleErrors.length > 0 || networkErrors.length > 0 ? 'high' : 'medium' });
        }

        if (plan.screenshots.includes(step.id)) {
          const ss = await this.provider.captureScreenshot(`step-${step.id}`, step.id);
          allScreenshots.push(ss);
          await this.emitEvent('SCREENSHOT_CAPTURED', {
            task_id: task.task_id,
            project_name: projectName,
            screenshot_name: ss.name,
            step_id: step.id,
          });
        }
      }

      const browserResult: BrowserTestResult = {
        plan_name: plan.name,
        base_url: plan.base_url,
        passed: plan.steps.every((s) => !bugsFiled.some((b) => b.id.endsWith(s.id))),
        total_steps: plan.steps.length,
        passed_steps: plan.steps.length - bugsFiled.length,
        failed_steps: bugsFiled.length,
        skipped_steps: 0,
        failures: [],
        screenshots: allScreenshots,
        console_logs: allConsoleLogs,
        network_artifacts: allNetworkArtifacts,
        dom_snapshots: [],
        started_at: startedAtISO,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      };

      await this.provider.close();

      const allPassed = browserResult.passed;
      const elapsed = Date.now() - startedAt;
      const completedAt = new Date().toISOString();

      const report = this.buildReport(projectName, plan, browserResult, bugsFiled);
      TestReportSchema.parse(report);

      const summary = this.buildSummary(projectName, browserResult, bugsFiled);

      await this.log(allPassed ? 'success' : 'partial',
        `Testing ${allPassed ? 'complete' : 'completed with failures'} in ${elapsed}ms. ${browserResult.passed_steps}/${browserResult.total_steps} steps passed. ${bugsFiled.length} bugs filed. ${allScreenshots.length} screenshots captured. ${allConsoleLogs.filter((l) => l.level === 'error').length} console errors. ${allNetworkArtifacts.filter((a) => !a.success).length} network failures.`,
      );

      await this.emitEvent('TESTING_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        passed: allPassed,
        total_steps: browserResult.total_steps,
        passed_steps: browserResult.passed_steps,
        failed_steps: browserResult.failed_steps,
        bugs_filed: bugsFiled.length,
        screenshots_captured: allScreenshots.length,
        console_errors: allConsoleLogs.filter((l) => l.level === 'error').length,
        network_failures: allNetworkArtifacts.filter((a) => !a.success).length,
        duration_ms: elapsed,
        summary,
      });

      return {
        task_id: task.task_id,
        status: allPassed ? 'COMPLETED' : (browserResult.passed_steps > 0 ? 'COMPLETED' : 'FAILED'),
        exit_code: allPassed ? 'AGENT_OK' : (browserResult.passed_steps > 0 ? 'AGENT_OK' : 'AGENT_FAIL'),
        artifacts: [],
        criteria_results: task.acceptance_criteria.map((c) => ({
          criterion_id: c.criterion_id,
          passed: allPassed,
          evidence: allPassed
            ? `Testing completed: ${c.description}`
            : `Testing had ${bugsFiled.length} failures: ${c.description} (${browserResult.passed_steps}/${browserResult.total_steps} steps passed)`,
        })),
        summary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Browser testing failed: ${errorMessage}`);
      await this.emitEvent('TESTING_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        passed: false,
        error: errorMessage,
      });

      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Browser testing failed: ${errorMessage}`,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  async initialize(): Promise<void> {
    await this.log('partial', 'Playwright Test V1 initialized');
  }

  async shutdown(): Promise<void> {
    await this.log('partial', 'Playwright Test V1 shutting down');
  }

  private parseInput(task: Task): TestPlan | null {
    const input = task.input ?? {};
    if (input.test_plan) {
      return input.test_plan as TestPlan;
    }
    if (input.name && input.base_url && input.steps) {
      return input as unknown as TestPlan;
    }
    return null;
  }

  private buildReport(
    projectName: string,
    plan: TestPlan,
    browserResult: BrowserTestResult,
    bugsFiled: Array<{ id: string; description: string; severity: string }>,
  ): TestReport {
    return {
      project_name: projectName,
      test_plan: plan,
      browser_results: [browserResult],
      summary: `${browserResult.passed_steps}/${browserResult.total_steps} steps passed. ${bugsFiled.length} bugs filed.`,
      total_tests: plan.steps.length,
      passed: browserResult.passed_steps,
      failed: browserResult.failed_steps,
      total_screenshots: browserResult.screenshots.length,
      total_console_errors: browserResult.console_logs.filter((l) => l.level === 'error').length,
      total_network_errors: browserResult.network_artifacts.filter((a) => !a.success).length,
      bugs_filed: bugsFiled.length,
      generated_at: new Date().toISOString(),
      test_runner_version: '1.0.0',
    };
  }

  private buildSummary(
    projectName: string,
    result: BrowserTestResult,
    bugsFiled: Array<{ id: string; description: string; severity: string }>,
  ): string {
    const consoleErrors = result.console_logs.filter((l) => l.level === 'error');
    const networkFailures = result.network_artifacts.filter((a) => !a.success);

    return [
      `# Browser Test Results for "${projectName}"`,
      '',
      `**Test Plan:** ${result.plan_name}`,
      `**Base URL:** ${result.base_url}`,
      `**Overall:** ${result.passed ? 'PASSED' : 'FAILED'}`,
      `**Steps:** ${result.passed_steps}/${result.total_steps} passed (${result.failed_steps} failed${result.skipped_steps > 0 ? `, ${result.skipped_steps} skipped` : ''})`,
      `**Screenshots:** ${result.screenshots.length}`,
      `**Console Errors:** ${consoleErrors.length}`,
      `**Network Failures:** ${networkFailures.length}`,
      `**Bugs Filed:** ${bugsFiled.length}`,
      `**Duration:** ${result.duration_ms}ms`,
      '',
      bugsFiled.length > 0 ? '**Bugs Filed:**' : '',
      ...bugsFiled.map((b) => `- ${b.id}: ${b.description} [${b.severity}]`),
      '',
      consoleErrors.length > 0 ? '**Console Errors Detected:**' : '',
      ...consoleErrors.map((c) => `- [${c.level}] ${c.message}${c.step_id ? ` (step: ${c.step_id})` : ''}`),
      '',
      networkFailures.length > 0 ? '**Network Failures Detected:**' : '',
      ...networkFailures.map((n) => `- ${n.method} ${n.url} → ${n.status_code ?? 'N/A'}: ${n.error ?? 'Unknown'}${n.step_id ? ` (step: ${n.step_id})` : ''}`),
      '',
      '**Next steps:** Review filed bugs, reproduce failures, and fix issues before re-testing.',
    ].filter(Boolean).join('\n');
  }

  private async fileBug(
    id: string,
    opts: {
      stepId: string;
      stepDescription: string;
      error: string;
      consoleErrors: string[];
      networkErrors: string[];
    },
  ): Promise<void> {
    if (!this.memoryWriter) return;
    try {
      const steps = [`1. Start the application`, `2. Navigate to the test page`, `3. Execute step "${opts.stepId}": ${opts.stepDescription}`, `4. Observe the failure: ${opts.error}`];
      if (opts.consoleErrors.length > 0) {
        steps.push(`5. Check console for errors: ${opts.consoleErrors.join('; ')}`);
      }
      if (opts.networkErrors.length > 0) {
        steps.push(`6. Check network tab for failures: ${opts.networkErrors.join('; ')}`);
      }

      await this.memoryWriter.appendBug({
        id,
        timestamp: new Date().toISOString(),
        severity: opts.consoleErrors.length > 0 || opts.networkErrors.length > 0 ? 'high' : 'medium',
        found_by: this.manifest.agent_id,
        phase: 'TESTING',
        task_id: null,
        type: 'functional',
        description: `Test step "${opts.stepId}" (${opts.stepDescription}) failed: ${opts.error}`,
        files: [],
        steps_to_reproduce: steps.join('\n'),
        status: 'open',
        assigned_to: null,
        fix_commit: null,
        retest_status: 'pending',
      });
    } catch {
      // swallow memory writer errors — non-critical
    }
  }

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    try {
      await this.memoryWriter.appendLog({
        timestamp: new Date().toISOString(),
        phase: 'TESTING',
        agent_id: this.manifest.agent_id,
        action: 'browser_testing',
        task_id: null,
        correlation_id: '',
        body,
        result,
        artifacts: [],
      });
    } catch {
      // swallow
    }
  }

  private async writeDecision(opts: {
    id: string;
    decision: string;
    context: string;
    alternatives: Array<{ name: string; analysis: string }>;
    rationale: string;
    consequences: string;
  }): Promise<void> {
    if (!this.memoryWriter) return;
    try {
      await this.memoryWriter.appendDecision({
        id: opts.id,
        timestamp: new Date().toISOString(),
        decision: opts.decision,
        agent_id: this.manifest.agent_id,
        task_id: null,
        phase: 'TESTING',
        context: opts.context,
        alternatives: opts.alternatives,
        rationale: opts.rationale,
        consequences: opts.consequences,
        status: 'active',
        superseded_by: null,
      });
    } catch {
      // swallow
    }
  }

  private async emitEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish(
      createEvent({
        type,
        source: this.manifest.agent_id,
        target: '*',
        payload,
      }),
    );
  }
}
