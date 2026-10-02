import { DecisionLogger, type DecisionTrace } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import {
  InternetToolGateway,
  type GitHubResult,
  type DeployResult,
  type DeployConfig,
} from './internet-tool-gateway.js';
import { LiveBrowserTestAgent, type LiveBrowserTestResult } from './live-browser-test-agent.js';

export type ToolType = 'github' | 'deploy' | 'browser_test' | 'filesystem' | 'shell' | 'package_manager' | 'fetch';

export interface ToolExecutionRecord {
  recordId: string;
  toolType: ToolType;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  success: boolean;
  durationMs: number;
  timestamp: string;
  error: string | null;
}

export interface ToolCallRecord {
  callId: string;
  toolType: ToolType;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  success: boolean;
  durationMs: number;
  timestamp: string;
  error: string | null;
}

export interface ToolExecutionGatewayConfig {
  allowedTools: ToolType[];
  requireApprovalFor: ToolType[];
  maxRetries: number;
  logAllCalls: boolean;
}

export class ToolExecutionGateway {
  private readonly seed: number;
  private readonly gatewayId: string;
  private readonly toolGateway: InternetToolGateway;
  private readonly browserAgent: LiveBrowserTestAgent;
  private readonly decisionLogger: DecisionLogger;
  private readonly config: ToolExecutionGatewayConfig;
  private callLog: ToolCallRecord[] = [];

  constructor(seed = 42, config?: Partial<ToolExecutionGatewayConfig>) {
    this.seed = seed;
    this.gatewayId = 'tool-gw-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.toolGateway = new InternetToolGateway({ workingDir: '.' }, seed);
    this.browserAgent = new LiveBrowserTestAgent(this.toolGateway, seed);
    this.decisionLogger = new DecisionLogger(seed + 2000);
    this.config = {
      allowedTools: ['github', 'deploy', 'browser_test', 'filesystem', 'fetch'],
      requireApprovalFor: ['deploy', 'shell'],
      maxRetries: 3,
      logAllCalls: true,
      ...config,
    };
  }

  getCallLog(): ToolCallRecord[] {
    return [...this.callLog];
  }
  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getToolGateway(): InternetToolGateway {
    return this.toolGateway;
  }
  getBrowserAgent(): LiveBrowserTestAgent {
    return this.browserAgent;
  }

  isToolAllowed(tool: ToolType): boolean {
    return this.config.allowedTools.includes(tool);
  }

  requiresApproval(tool: ToolType): boolean {
    return this.config.requireApprovalFor.includes(tool);
  }

  async executeGitHub(action: string, params: Record<string, unknown>): Promise<GitHubResult> {
    const callId = 'call-' + createDeterministicUuid(this.seed, this.callLog.length).slice(0, 8);
    const startTime = Date.now();

    try {
      this.decisionLogger.log('deployment', 'github_' + action, `GitHub: ${action}`, 0.8, [], { callId, ...params });

      let result: GitHubResult;
      switch (action) {
        case 'create_repo':
          result = await this.toolGateway.createGitHubRepository({
            repoName: params.repoName as string,
            description: params.description as string,
          });
          break;
        case 'push_files':
          result = await this.toolGateway.pushCommits(params.repoName as string, params as any);
          break;
        case 'commit':
          result = await this.toolGateway.pushCommits(params.repoName as string, params as any);
          break;
        default:
          throw new Error(`Unknown GitHub action: ${action}`);
      }

      this.callLog.push({
        callId,
        toolType: 'github',
        action,
        input: params,
        output: result as any,
        success: true,
        durationMs: Date.now() - startTime,
        timestamp: deterministicNow(this.seed),
        error: null,
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callLog.push({
        callId,
        toolType: 'github',
        action,
        input: params,
        output: null,
        success: false,
        durationMs: Date.now() - startTime,
        timestamp: deterministicNow(this.seed),
        error: msg,
      });
      throw err;
    }
  }

  async executeDeploy(config: DeployConfig): Promise<DeployResult> {
    const callId = 'call-' + createDeterministicUuid(this.seed, this.callLog.length).slice(0, 8);
    const startTime = Date.now();

    try {
      this.decisionLogger.log('deployment', 'deploy_start', `Deploying to ${config.target}`, 0.7, [], {
        callId,
        target: config.target,
      });

      const result = await this.toolGateway.deploy(config);

      this.callLog.push({
        callId,
        toolType: 'deploy',
        action: 'deploy',
        input: config as any,
        output: result as any,
        success: true,
        durationMs: Date.now() - startTime,
        timestamp: deterministicNow(this.seed),
        error: null,
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callLog.push({
        callId,
        toolType: 'deploy',
        action: 'deploy',
        input: config as any,
        output: null,
        success: false,
        durationMs: Date.now() - startTime,
        timestamp: deterministicNow(this.seed),
        error: msg,
      });
      throw err;
    }
  }

  async executeBrowserTest(url: string): Promise<LiveBrowserTestResult> {
    const callId = 'call-' + createDeterministicUuid(this.seed, this.callLog.length).slice(0, 8);
    const startTime = Date.now();

    try {
      this.decisionLogger.log('ux', 'browser_test', `Testing URL: ${url}`, 0.8, [], { callId, url });

      const spec = this.browserAgent.buildTestSpec('browser-test', url, [], []);
      const result = await this.browserAgent.runTest(spec);

      this.callLog.push({
        callId,
        toolType: 'browser_test',
        action: 'test_url',
        input: { url },
        output: result as any,
        success: result.passed,
        durationMs: Date.now() - startTime,
        timestamp: deterministicNow(this.seed),
        error: null,
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callLog.push({
        callId,
        toolType: 'browser_test',
        action: 'test_url',
        input: { url },
        output: null,
        success: false,
        durationMs: Date.now() - startTime,
        timestamp: deterministicNow(this.seed),
        error: msg,
      });
      throw err;
    }
  }

  async executeFetch(url: string, options?: RequestInit): Promise<{ status: number; body: string }> {
    const callId = 'call-' + createDeterministicUuid(this.seed, this.callLog.length).slice(0, 8);
    const startTime = Date.now();

    try {
      const response = await fetch(url, options);
      const body = await response.text();
      const result = { status: response.status, body: body.slice(0, 5000) };

      this.callLog.push({
        callId,
        toolType: 'fetch',
        action: 'fetch',
        input: { url },
        output: result as any,
        success: response.ok,
        durationMs: Date.now() - startTime,
        timestamp: deterministicNow(this.seed),
        error: null,
      });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callLog.push({
        callId,
        toolType: 'fetch',
        action: 'fetch',
        input: { url },
        output: null,
        success: false,
        durationMs: Date.now() - startTime,
        timestamp: deterministicNow(this.seed),
        error: msg,
      });
      throw err;
    }
  }

  getCallStats(): { total: number; success: number; failed: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const c of this.callLog) {
      byType[c.toolType] = (byType[c.toolType] ?? 0) + 1;
    }
    return {
      total: this.callLog.length,
      success: this.callLog.filter((c) => c.success).length,
      failed: this.callLog.filter((c) => !c.success).length,
      byType,
    };
  }
}
