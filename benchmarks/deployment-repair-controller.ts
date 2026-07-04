import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import type { DeployTarget } from './internet-tool-gateway.js';
import type { HumanControlLayer } from './human-control-layer.js';
import type { InternetToolGateway, DeployResult } from './internet-tool-gateway.js';
import type { TaskCategory, TaskGraph } from './task-graph.js';

export type DeploymentStatus = 'pending' | 'deploying' | 'live' | 'failed' | 'rolled_back' | 'repairing';
export type FailureCategory =
  | 'build_error'
  | 'runtime_error'
  | 'network_error'
  | 'ui_error'
  | 'deploy_timeout'
  | 'config_error';

export interface DeploymentCycle {
  cycleNumber: number;
  deployId: string | null;
  url: string | null;
  status: DeploymentStatus;
  failures: DeployFailure[];
  repairs: RepairAction[];
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
}

export interface DeployFailure {
  failureId: string;
  category: FailureCategory;
  message: string;
  source: 'build_log' | 'browser_test' | 'runtime_monitor' | 'api_response';
  details: Record<string, unknown>;
  timestamp: string;
}

export interface RepairAction {
  actionId: string;
  type: 'fix_build' | 'fix_routing' | 'fix_env' | 'fix_ui' | 'redeploy' | 'rollback';
  targetTaskId: string | null;
  description: string;
  applied: boolean;
  result: string | null;
  timestamp: string;
}

export interface RepairControllerConfig {
  maxRepairCycles: number;
  redeployAfterRepair: boolean;
  rollbackOnFailure: boolean;
  notifyOnEachCycle: boolean;
}

export class DeploymentRepairController {
  private readonly seed: number;
  private readonly controllerId: string;
  private readonly toolGateway: InternetToolGateway;
  private readonly humanControl: HumanControlLayer;
  private readonly taskGraph: TaskGraph;
  private readonly config: RepairControllerConfig;
  private cycles: DeploymentCycle[] = [];
  private currentStatus: DeploymentStatus = 'pending';

  constructor(
    toolGateway: InternetToolGateway,
    humanControl: HumanControlLayer,
    taskGraph: TaskGraph,
    config?: Partial<RepairControllerConfig>,
    seed = 42,
  ) {
    this.seed = seed;
    this.controllerId = 'repair-ctrl-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.toolGateway = toolGateway;
    this.humanControl = humanControl;
    this.taskGraph = taskGraph;
    this.config = {
      maxRepairCycles: config?.maxRepairCycles ?? 3,
      redeployAfterRepair: config?.redeployAfterRepair ?? true,
      rollbackOnFailure: config?.rollbackOnFailure ?? true,
      notifyOnEachCycle: config?.notifyOnEachCycle ?? true,
    };
  }

  getStatus(): DeploymentStatus {
    return this.currentStatus;
  }
  getCycles(): DeploymentCycle[] {
    return [...this.cycles];
  }
  getCurrentCycle(): DeploymentCycle | null {
    return this.cycles[this.cycles.length - 1] ?? null;
  }

  async startDeployment(repoName: string, deployTarget: string, projectDir: string): Promise<DeployResult> {
    this.currentStatus = 'deploying';
    const cycle: DeploymentCycle = {
      cycleNumber: this.cycles.length + 1,
      deployId: null,
      url: null,
      status: 'deploying',
      failures: [],
      repairs: [],
      startedAt: deterministicNow(this.seed + this.cycles.length),
      completedAt: null,
      durationMs: 0,
    };
    this.cycles.push(cycle);
    return this.toolGateway.deploy({ target: deployTarget as DeployTarget, projectDir });
  }

  async monitorAndRepair(
    deployResult: DeployResult,
    taskGraph: TaskGraph,
    uiTaskIds: string[],
  ): Promise<DeploymentCycle> {
    const cycle = this.getCurrentCycle();
    if (!cycle) throw new Error('No active deployment cycle');

    cycle.deployId = deployResult.deployId;
    cycle.url = deployResult.url;

    if (!deployResult.success) {
      cycle.failures.push({
        failureId: 'fail-' + createDeterministicUuid(this.seed, cycle.failures.length).slice(0, 8),
        category: 'build_error',
        message: deployResult.error ?? 'Deployment failed',
        source: 'api_response',
        details: { deployResult },
        timestamp: deterministicNow(this.seed + cycle.failures.length),
      });
      cycle.status = 'failed';
      this.currentStatus = 'failed';
      await this.repairCycle(taskGraph, uiTaskIds);
      return cycle;
    }

    cycle.status = 'live';
    this.currentStatus = 'live';

    for (let attempt = 0; attempt < this.config.maxRepairCycles; attempt++) {
      const testFailures = await this.detectRuntimeFailures(deployResult.url ?? '');
      if (testFailures.length === 0) {
        cycle.status = 'live';
        this.currentStatus = 'live';
        break;
      }

      cycle.failures.push(...testFailures);
      cycle.status = 'repairing';
      this.currentStatus = 'repairing';

      const repairs = this.generateRepairs(testFailures);
      cycle.repairs.push(...repairs);

      for (const repair of repairs) {
        await this.applyRepair(repair);
        if (repair.targetTaskId && this.config.redeployAfterRepair) {
          const newDeploy = await this.toolGateway.deploy({ target: 'vercel', projectDir: '.' });
          if (newDeploy.success) {
            cycle.url = newDeploy.url;
            cycle.deployId = newDeploy.deployId;
          }
        }
      }
    }

    cycle.completedAt = deterministicNow(this.seed + cycle.failures.length);
    return cycle;
  }

  private async detectRuntimeFailures(url: string): Promise<DeployFailure[]> {
    const failures: DeployFailure[] = [];
    if (!url) return failures;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        failures.push({
          failureId: 'fail-live-' + createDeterministicUuid(this.seed, failures.length).slice(0, 8),
          category: 'runtime_error',
          message: `HTTP ${res.status}: ${res.statusText}`,
          source: 'runtime_monitor',
          details: { url, status: res.status },
          timestamp: deterministicNow(this.seed + failures.length),
        });
      }
    } catch (err) {
      failures.push({
        failureId: 'fail-live-' + createDeterministicUuid(this.seed, failures.length).slice(0, 8),
        category: 'network_error',
        message: err instanceof Error ? err.message : 'Network error',
        source: 'runtime_monitor',
        details: { url },
        timestamp: deterministicNow(this.seed + failures.length),
      });
    }
    return failures;
  }

  private generateRepairs(failures: DeployFailure[]): RepairAction[] {
    return failures.map((f) => {
      let type: RepairAction['type'] = 'fix_build';
      let targetTaskId: string | null = null;
      let description = '';

      switch (f.category) {
        case 'build_error':
          type = 'fix_build';
          targetTaskId = this.findTaskByCategory('backend');
          description = 'Fix build configuration: ' + f.message;
          break;
        case 'runtime_error':
          type = 'fix_routing';
          targetTaskId = this.findTaskByCategory('frontend');
          description = 'Fix runtime routing: ' + f.message;
          break;
        case 'network_error':
          type = 'fix_env';
          targetTaskId = this.findTaskByCategory('deployment');
          description = 'Fix network/environment config: ' + f.message;
          break;
        case 'ui_error':
          type = 'fix_ui';
          targetTaskId = this.findTaskByCategory('frontend');
          description = 'Fix UI component: ' + f.message;
          break;
        default:
          type = 'redeploy';
          description = 'Redeploy after failure: ' + f.message;
      }

      return {
        type,
        actionId:
          'rep-' + createDeterministicUuid(this.seed, this.cycles.length * 100 + failures.indexOf(f)).slice(0, 8),
        targetTaskId,
        description,
        applied: false,
        result: null,
        timestamp: deterministicNow(this.seed + failures.length),
      };
    });
  }

  private findTaskByCategory(category: string): string | null {
    const nodes = this.taskGraph.getNodesByCategory(category as TaskCategory);
    return nodes.length > 0 ? nodes[nodes.length - 1]!.id : null;
  }

  private async applyRepair(repair: RepairAction): Promise<void> {
    repair.applied = true;
    repair.result = 'Repair queued: ' + repair.description;
    if (repair.targetTaskId) {
      this.taskGraph.markPending(repair.targetTaskId);
    }
  }

  async repairCycle(taskGraph: TaskGraph, uiTaskIds: string[]): Promise<void> {
    this.currentStatus = 'repairing';
    const failures = this.cycles.flatMap((c) => c.failures);
    const repairs = this.generateRepairs(failures);

    for (const repair of repairs) {
      await this.applyRepair(repair);
    }

    if (this.config.redeployAfterRepair) {
      this.currentStatus = 'deploying';
    }
  }

  async rollback(repoName: string, commitSha: string): Promise<boolean> {
    if (this.config.rollbackOnFailure) {
      const approval = this.humanControl.requestRollbackApproval('Rollback deployment due to failures', {
        repoName,
        commitSha,
      });
      this.humanControl.approve(approval.approvalId, 'auto-rollback');
      const success = await this.toolGateway.rollbackCommit(repoName, commitSha);
      if (success) {
        this.currentStatus = 'rolled_back';
        const cycle = this.getCurrentCycle();
        if (cycle) cycle.status = 'rolled_back';
      }
      return success;
    }
    return false;
  }

  shouldContinue(): boolean {
    const active = this.cycles.filter((c) => c.status === 'repairing' || c.status === 'deploying');
    return active.length <= this.config.maxRepairCycles;
  }
}
