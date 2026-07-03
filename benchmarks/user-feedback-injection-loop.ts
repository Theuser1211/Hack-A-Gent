import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';
import type { ReplanAction } from './global-execution-brain.js';
import type { SkillGraph } from './skill-graph.js';
import type { TaskGraph } from './task-graph.js';

export type FeedbackType = 'ui_critique' | 'feature_request' | 'blocking_issue' | 'preference_override' | 'general';

export interface UserFeedback {
  feedbackId: string;
  type: FeedbackType;
  message: string;
  source: 'user' | 'simulated';
  priority: number;
  timestamp: string;
  addressed: boolean;
  responseAction: string | null;
}

export class UserFeedbackInjectionLoop {
  private readonly seed: number;
  private readonly loopId: string;
  private readonly decisionLogger: DecisionLogger;
  private feedbackQueue: UserFeedback[] = [];
  private feedbackHistory: UserFeedback[] = [];

  constructor(seed = 42) {
    this.seed = seed;
    this.loopId = 'fb-loop-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.decisionLogger = new DecisionLogger(seed + 10000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getFeedbackQueue(): UserFeedback[] {
    return [...this.feedbackQueue];
  }
  getFeedbackHistory(): UserFeedback[] {
    return [...this.feedbackHistory];
  }
  hasQueuedFeedback(): boolean {
    return this.feedbackQueue.length > 0;
  }

  ingestUserFeedback(
    type: FeedbackType,
    message: string,
    priority = 5,
    source: 'user' | 'simulated' = 'user',
  ): UserFeedback {
    const feedback: UserFeedback = {
      feedbackId: 'fb-' + createDeterministicUuid(this.seed, this.feedbackHistory.length).slice(0, 8),
      message,
      source,
      priority,
      timestamp: deterministicNow(this.seed),
      addressed: false,
      responseAction: null,
    };

    this.feedbackQueue.push(feedback);
    this.feedbackHistory.push(feedback);

    this.decisionLogger.log('planner', 'feedback_ingested', `[feedback] ${message.slice(0, 60)}`, 0.7, [], {
      feedbackId: feedback.feedbackId,
      priority,
      source,
    });

    return feedback;
  }

  processNextFeedback(taskGraph: TaskGraph, skillGraph?: SkillGraph): ReplanAction | null {
    if (this.feedbackQueue.length === 0) return null;

    // Sort by priority (highest first)
    this.feedbackQueue.sort((a, b) => b.priority - a.priority);
    const feedback = this.feedbackQueue.shift()!;

    let replanAction: ReplanAction | null = null;

    switch (feedback.type) {
      case 'ui_critique': {
        const uiTasks = taskGraph.getNodesByCategory('frontend');
        const pending = uiTasks.filter((n) => n.status === 'pending');
        const affectedIds = pending.map((n) => n.id);
        replanAction = {
          id: 'replan-' + createDeterministicUuid(this.seed, this.feedbackHistory.length).slice(0, 8),
          reason: 'user_feedback',
          description: `UI critique: ${feedback.message.slice(0, 60)}`,
          affectedTaskIds: affectedIds,
          priorityChanges: [],
          skippedTasks: [],
          addedTasks: [`Adjust UI based on feedback: ${feedback.message.slice(0, 40)}`],
          timestamp: deterministicNow(this.seed),
        };
        break;
      }
      case 'feature_request': {
        replanAction = {
          id: 'replan-' + createDeterministicUuid(this.seed, this.feedbackHistory.length).slice(0, 8),
          reason: 'user_feedback',
          description: `Feature request: ${feedback.message.slice(0, 60)}`,
          affectedTaskIds: [],
          priorityChanges: [],
          skippedTasks: [],
          addedTasks: [`Implement: ${feedback.message.slice(0, 50)}`],
          timestamp: deterministicNow(this.seed),
        };
        break;
      }
      case 'blocking_issue': {
        const blockedTask = taskGraph
          .getAllNodes()
          .find((n) => n.description.toLowerCase().includes(feedback.message.slice(0, 20).toLowerCase()));
        replanAction = {
          id: 'replan-' + createDeterministicUuid(this.seed, this.feedbackHistory.length).slice(0, 8),
          reason: 'user_feedback',
          description: `Blocking issue: ${feedback.message.slice(0, 60)}`,
          affectedTaskIds: blockedTask ? [blockedTask.id] : [],
          priorityChanges: blockedTask ? [{ taskId: blockedTask.id, oldPriority: 0, newPriority: 10 }] : [],
          skippedTasks: [],
          addedTasks: [`Resolve: ${feedback.message.slice(0, 50)}`],
          timestamp: deterministicNow(this.seed),
        };
        break;
      }
      case 'preference_override': {
        replanAction = {
          id: 'replan-' + createDeterministicUuid(this.seed, this.feedbackHistory.length).slice(0, 8),
          reason: 'user_feedback',
          description: `Preference: ${feedback.message.slice(0, 60)}`,
          affectedTaskIds: taskGraph.getAllNodes().map((n) => n.id),
          priorityChanges: [],
          skippedTasks: [],
          addedTasks: [],
          timestamp: deterministicNow(this.seed),
        };
        break;
      }
      case 'general': {
        replanAction = {
          id: 'replan-' + createDeterministicUuid(this.seed, this.feedbackHistory.length).slice(0, 8),
          reason: 'user_feedback',
          description: `General: ${feedback.message.slice(0, 60)}`,
          affectedTaskIds: [],
          priorityChanges: [],
          skippedTasks: [],
          addedTasks: [`Process feedback: ${feedback.message.slice(0, 50)}`],
          timestamp: deterministicNow(this.seed),
        };
        break;
      }
    }

    feedback.addressed = true;
    feedback.responseAction = replanAction?.description ?? null;

    if (replanAction) {
      this.decisionLogger.log('planner', 'feedback_processed', replanAction.description, 0.8, [], {
        feedbackId: feedback.feedbackId,
        type: feedback.type,
        replanId: replanAction.id,
      });
    }

    return replanAction;
  }

  updateSkillGraphWeights(skillGraph: SkillGraph, feedbackType: FeedbackType): void {
    if (feedbackType === 'ui_critique') {
      const rng = getSeededRandom(this.seed);
      skillGraph.recordProjectOutcome(['React', 'Tailwind', 'CSS'], 0.7 + rng.next() * 0.2, true, true);
    }
  }

  clearFeedback(): void {
    this.feedbackQueue = [];
  }

  getFeedbackStats(): { total: number; addressed: number; pending: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const fb of this.feedbackHistory) {
      byType[fb.type] = (byType[fb.type] ?? 0) + 1;
    }
    return {
      total: this.feedbackHistory.length,
      addressed: this.feedbackHistory.filter((f) => f.addressed).length,
      pending: this.feedbackQueue.length,
      byType,
    };
  }
}
