import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';

export type TaskStatus = 'pending' | 'running' | 'blocked' | 'done';
export type TaskCategory = 'frontend' | 'backend' | 'infra' | 'testing' | 'deployment' | 'planning' | 'integration';

export interface TaskNode {
  id: string;
  description: string;
  category: TaskCategory;
  dependencies: string[];
  assignedAgent: string;
  status: TaskStatus;
  artifacts: string[];
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  checkpointData: Record<string, unknown> | null;
}

export interface TaskGraphSnapshot {
  graphId: string;
  graphName: string;
  nodes: TaskNode[];
  executionOrder: string[];
  currentIndex: number;
  seed: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, string>;
}

export class TaskGraph {
  private nodes: Map<string, TaskNode> = new Map();
  private executionOrder: string[] = [];
  private currentIndex = 0;
  private readonly seed: number;
  private readonly graphId: string;
  private readonly graphName: string;

  constructor(graphName: string, seed = 42) {
    this.seed = seed;
    this.graphName = graphName;
    this.graphId = `graph-${createDeterministicUuid(seed, 0).slice(0, 8)}`;
  }

  addNode(description: string, category: TaskCategory, dependencies: string[] = [], assignedAgent = ''): string {
    const id = `task-${createDeterministicUuid(this.seed, this.nodes.size + 1).slice(0, 8)}`;
    const node: TaskNode = {
      id,
      description,
      category,
      dependencies,
      assignedAgent,
      status: 'pending',
      artifacts: [],
      error: null,
      createdAt: deterministicNow(this.seed + this.nodes.size),
      startedAt: null,
      completedAt: null,
      checkpointData: null,
    };
    this.nodes.set(id, node);
    return id;
  }

  getNode(id: string): TaskNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): TaskNode[] {
    return Array.from(this.nodes.values());
  }

  getNodesByCategory(category: TaskCategory): TaskNode[] {
    return this.getAllNodes().filter((n) => n.category === category);
  }

  getNodesByStatus(status: TaskStatus): TaskNode[] {
    return this.getAllNodes().filter((n) => n.status === status);
  }

  updateNode(id: string, updates: Partial<TaskNode>): void {
    const node = this.nodes.get(id);
    if (node) {
      Object.assign(node, updates);
    }
  }

  markRunning(id: string): void {
    this.updateNode(id, { status: 'running', startedAt: deterministicNow(this.seed + Date.now()) });
  }

  markDone(id: string, artifacts: string[] = []): void {
    this.updateNode(id, { status: 'done', artifacts, completedAt: deterministicNow(this.seed + Date.now()) });
  }

  markBlocked(id: string, error: string): void {
    this.updateNode(id, { status: 'blocked', error });
  }

  markPending(id: string): void {
    this.updateNode(id, { status: 'pending', error: null });
  }

  addArtifact(id: string, artifact: string): void {
    const node = this.nodes.get(id);
    if (node) {
      node.artifacts.push(artifact);
    }
  }

  getDependencies(id: string): TaskNode[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    return node.dependencies.map((depId) => this.nodes.get(depId)).filter((n): n is TaskNode => n !== undefined);
  }

  getDependents(id: string): TaskNode[] {
    return this.getAllNodes().filter((n) => n.dependencies.includes(id));
  }

  areDependenciesMet(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    return node.dependencies.every((depId) => {
      const dep = this.nodes.get(depId);
      return dep && dep.status === 'done';
    });
  }

  getReadyNodes(): TaskNode[] {
    return this.getAllNodes().filter((n) => n.status === 'pending' && this.areDependenciesMet(n.id));
  }

  getBlockedNodes(): TaskNode[] {
    return this.getAllNodes().filter((n) => {
      if (n.status !== 'pending') return false;
      return n.dependencies.some((depId) => {
        const dep = this.nodes.get(depId);
        return !dep || dep.status !== 'done';
      });
    });
  }

  computeExecutionOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];
    const allIds = this.getAllNodes().map((n) => n.id);

    const visit = (id: string, path: Set<string>): void => {
      if (visited.has(id)) return;
      if (path.has(id)) throw new Error(`Circular dependency detected: ${id}`);
      path.add(id);
      const deps = this.nodes.get(id)?.dependencies ?? [];
      for (const depId of deps) {
        if (this.nodes.has(depId)) {
          visit(depId, path);
        }
      }
      path.delete(id);
      visited.add(id);
      order.push(id);
    };

    for (const id of allIds) {
      visit(id, new Set());
    }

    this.executionOrder = order;
    return order;
  }

  getNextReady(): TaskNode | null {
    const ready = this.getReadyNodes();
    if (ready.length === 0) return null;

    const orderedReady = ready.filter((n) => {
      const idx = this.executionOrder.indexOf(n.id);
      return idx >= this.currentIndex;
    });

    if (orderedReady.length === 0) {
      const idx = this.executionOrder.findIndex((id) => this.nodes.get(id)?.status === 'pending');
      if (idx >= 0) this.currentIndex = idx;
      return this.getReadyNodes()[0] ?? null;
    }

    orderedReady.sort((a, b) => this.executionOrder.indexOf(a.id) - this.executionOrder.indexOf(b.id));
    return orderedReady[0]!;
  }

  hasUnfinishedWork(): boolean {
    return this.getAllNodes().some((n) => n.status === 'pending' || n.status === 'running');
  }

  getProgress(): { total: number; done: number; running: number; blocked: number; pending: number } {
    const all = this.getAllNodes();
    return {
      total: all.length,
      done: all.filter((n) => n.status === 'done').length,
      running: all.filter((n) => n.status === 'running').length,
      blocked: all.filter((n) => n.status === 'blocked').length,
      pending: all.filter((n) => n.status === 'pending').length,
    };
  }

  saveCheckpoint(): TaskGraphSnapshot {
    return {
      graphId: this.graphId,
      graphName: this.graphName,
      nodes: this.getAllNodes(),
      executionOrder: [...this.executionOrder],
      currentIndex: this.currentIndex,
      seed: this.seed,
      createdAt: deterministicNow(this.seed),
      updatedAt: deterministicNow(this.seed + this.nodes.size),
      metadata: {},
    };
  }

  static loadCheckpoint(snapshot: TaskGraphSnapshot): TaskGraph {
    const graph = new TaskGraph(snapshot.graphName, snapshot.seed);
    graph.nodes.clear();
    for (const node of snapshot.nodes) {
      graph.nodes.set(node.id, { ...node });
    }
    graph.executionOrder = [...snapshot.executionOrder];
    graph.currentIndex = snapshot.currentIndex;
    return graph;
  }

  toJSON(): TaskGraphSnapshot {
    return this.saveCheckpoint();
  }

  static fromJSON(data: TaskGraphSnapshot): TaskGraph {
    return TaskGraph.loadCheckpoint(data);
  }

  findBlockersForUserDecision(): TaskNode[] {
    return this.getBlockedNodes().filter((n) => {
      return n.error?.includes('requires_user_input') ?? false;
    });
  }

  getLargestUnprocessedCategory(): TaskCategory | null {
    const pending = this.getNodesByStatus('pending');
    if (pending.length === 0) return null;

    const counts: Record<string, number> = {};
    for (const n of pending) {
      counts[n.category] = (counts[n.category] ?? 0) + 1;
    }

    let maxCat: TaskCategory | null = null;
    let maxCount = 0;
    for (const [cat, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxCat = cat as TaskCategory;
      }
    }
    return maxCat;
  }
}
