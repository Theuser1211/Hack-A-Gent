import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import type { TaskGraph } from './task-graph.js';

export type ControlAction =
  | 'pause'
  | 'resume'
  | 'override'
  | 'modify_requirement'
  | 'approve_deployment'
  | 'inject_constraint'
  | 'skip_task'
  | 'restart_pipeline'
  | 'rollback'
  | 'cancel';

export interface OverrideDecision {
  decisionId: string;
  action: ControlAction;
  targetId: string;
  value: unknown;
  reason: string;
  timestamp: string;
  applied: boolean;
}

export interface PendingApproval {
  approvalId: string;
  type: 'deployment' | 'requirement_change' | 'rollback' | 'pipeline_restart' | 'constraint_injection';
  description: string;
  context: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
  approved: boolean | null;
  responder: string | null;
}

export interface ConstraintInjection {
  constraintId: string;
  description: string;
  type: 'deadline' | 'budget' | 'scope' | 'tech_stack' | 'quality' | 'custom';
  value: unknown;
  active: boolean;
  injectedAt: string;
}

export interface ControlState {
  isPaused: boolean;
  pausedAt: string | null;
  pauseReason: string | null;
  pendingApprovals: PendingApproval[];
  resolvedApprovals: PendingApproval[];
  activeConstraints: ConstraintInjection[];
  overrides: OverrideDecision[];
}

export type ControlListener = (action: ControlAction, data: Record<string, unknown>) => void;

export class HumanControlLayer {
  private readonly seed: number;
  private readonly controlId: string;
  private state: ControlState;
  private listeners: ControlListener[] = [];

  constructor(seed = 42) {
    this.seed = seed;
    this.controlId = 'ctrl-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.state = {
      isPaused: false,
      pausedAt: null,
      pauseReason: null,
      pendingApprovals: [],
      resolvedApprovals: [],
      activeConstraints: [],
      overrides: [],
    };
  }

  getState(): ControlState {
    return {
      ...this.state,
      pendingApprovals: [...this.state.pendingApprovals],
      resolvedApprovals: [...this.state.resolvedApprovals],
      activeConstraints: [...this.state.activeConstraints],
      overrides: [...this.state.overrides],
    };
  }
  isPaused(): boolean {
    return this.state.isPaused;
  }
  getPendingApprovals(): PendingApproval[] {
    return [...this.state.pendingApprovals];
  }
  getActiveConstraints(): ConstraintInjection[] {
    return [...this.state.activeConstraints];
  }

  onAction(listener: ControlListener): void {
    this.listeners.push(listener);
  }

  private emit(action: ControlAction, data: Record<string, unknown>): void {
    for (const l of this.listeners) l(action, data);
  }

  pause(reason: string): boolean {
    if (this.state.isPaused) return false;
    this.state.isPaused = true;
    this.state.pausedAt = deterministicNow(this.seed);
    this.state.pauseReason = reason;
    this.emit('pause', { reason });
    return true;
  }

  resume(): boolean {
    if (!this.state.isPaused) return false;
    this.state.isPaused = false;
    this.state.pausedAt = null;
    this.state.pauseReason = null;
    this.emit('resume', {});
    return true;
  }

  requestDeploymentApproval(description: string, context: Record<string, unknown> = {}): PendingApproval {
    return this.createApproval('deployment', description, context);
  }

  requestRollbackApproval(description: string, context: Record<string, unknown> = {}): PendingApproval {
    return this.createApproval('rollback', description, context);
  }

  private createApproval(
    type: PendingApproval['type'],
    description: string,
    context: Record<string, unknown>,
  ): PendingApproval {
    const approval: PendingApproval = {
      approvalId: 'appr-' + createDeterministicUuid(this.seed, this.state.pendingApprovals.length + 1).slice(0, 8),
      description,
      context,
      createdAt: deterministicNow(this.seed),
      resolvedAt: null,
      approved: null,
      responder: null,
    };
    this.state.pendingApprovals.push(approval);
    this.emit('pause', { approvalId: approval.approvalId, description });
    return approval;
  }

  approve(approvalId: string, responder = 'user'): boolean {
    const idx = this.state.pendingApprovals.findIndex((a) => a.approvalId === approvalId);
    if (idx === -1) return false;
    const approval = this.state.pendingApprovals[idx]!;
    approval.approved = true;
    approval.resolvedAt = deterministicNow(this.seed + this.state.resolvedApprovals.length);
    approval.responder = responder;
    this.state.resolvedApprovals.push(approval);
    this.state.pendingApprovals.splice(idx, 1);
    this.emit('override', { approvalId, action: 'approve' });
    return true;
  }

  reject(approvalId: string, responder = 'user'): boolean {
    const idx = this.state.pendingApprovals.findIndex((a) => a.approvalId === approvalId);
    if (idx === -1) return false;
    const approval = this.state.pendingApprovals[idx]!;
    approval.approved = false;
    approval.resolvedAt = deterministicNow(this.seed + this.state.resolvedApprovals.length);
    approval.responder = responder;
    this.state.resolvedApprovals.push(approval);
    this.state.pendingApprovals.splice(idx, 1);
    this.emit('override', { approvalId, action: 'reject' });
    return true;
  }

  injectConstraint(description: string, type: ConstraintInjection['type'], value: unknown): ConstraintInjection {
    const constraint: ConstraintInjection = {
      constraintId: 'constr-' + createDeterministicUuid(this.seed, this.state.activeConstraints.length + 1).slice(0, 8),
      description,
      value,
      active: true,
      injectedAt: deterministicNow(this.seed + this.state.activeConstraints.length),
    };
    this.state.activeConstraints.push(constraint);
    this.emit('inject_constraint', { constraint });
    return constraint;
  }

  removeConstraint(constraintId: string): boolean {
    const idx = this.state.activeConstraints.findIndex((c) => c.constraintId === constraintId);
    if (idx === -1) return false;
    this.state.activeConstraints.splice(idx, 1);
    return true;
  }

  applyOverride(action: ControlAction, targetId: string, value: unknown, reason: string): OverrideDecision {
    const decision: OverrideDecision = {
      decisionId: 'ovr-' + createDeterministicUuid(this.seed, this.state.overrides.length + 1).slice(0, 8),
      action,
      targetId,
      value,
      reason,
      timestamp: deterministicNow(this.seed + this.state.overrides.length),
      applied: true,
    };
    this.state.overrides.push(decision);
    this.emit(action, { targetId, value, reason });
    return decision;
  }

  skipTask(taskId: string, reason: string): OverrideDecision {
    return this.applyOverride('skip_task', taskId, { skipped: true }, reason);
  }

  modifyRequirement(reqId: string, newDescription: string): OverrideDecision {
    return this.applyOverride('modify_requirement', reqId, { newDescription }, 'Requirement modified by user');
  }

  restartPipeline(reason: string): OverrideDecision {
    return this.applyOverride('restart_pipeline', 'pipeline', { restart: true }, reason);
  }

  getApprovalById(approvalId: string): PendingApproval | undefined {
    return (
      this.state.pendingApprovals.find((a) => a.approvalId === approvalId) ??
      this.state.resolvedApprovals.find((a) => a.approvalId === approvalId)
    );
  }

  hasUnresolvedApprovals(): boolean {
    return this.state.pendingApprovals.length > 0;
  }

  isActionBlocked(action: string): boolean {
    if (this.state.isPaused) return true;
    if (action === 'deploy' && this.hasUnresolvedApprovals()) return true;
    return false;
  }

  getConstraintsByType(type: ConstraintInjection['type']): ConstraintInjection[] {
    return this.state.activeConstraints.filter((c) => c.type === type && c.active);
  }
}
