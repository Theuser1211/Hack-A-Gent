import type { SkillMetadata, ResolvedSkill, ConflictReport } from './skill-types.js';

export class SkillEngine {
  private registry: Map<string, SkillMetadata> = new Map();
  private techIndex: Map<string, Set<string>> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();

  register(skill: SkillMetadata): void {
    this.registry.set(skill.skill_id, skill);

    // Index by technology
    const tech = skill.technology.toLowerCase();
    if (!this.techIndex.has(tech)) this.techIndex.set(tech, new Set());
    this.techIndex.get(tech)!.add(skill.skill_id);

    // Index by keywords
    for (const kw of skill.keywords) {
      const key = kw.toLowerCase();
      if (!this.keywordIndex.has(key)) this.keywordIndex.set(key, new Set());
      this.keywordIndex.get(key)!.add(skill.skill_id);
    }

    // Index by type
    const type = skill.type;
    if (!this.typeIndex.has(type)) this.typeIndex.set(type, new Set());
    this.typeIndex.get(type)!.add(skill.skill_id);
  }

  registerMany(skills: SkillMetadata[]): void {
    for (const s of skills) this.register(s);
  }

  get(skillId: string): SkillMetadata | undefined {
    return this.registry.get(skillId);
  }

  getAll(): SkillMetadata[] {
    return [...this.registry.values()];
  }

  findByTechnology(tech: string): SkillMetadata[] {
    const ids = this.techIndex.get(tech.toLowerCase());
    if (!ids) return [];
    return [...ids].map((id) => this.registry.get(id)!).filter(Boolean);
  }

  findByKeyword(keyword: string): SkillMetadata[] {
    const ids = this.keywordIndex.get(keyword.toLowerCase());
    if (!ids) return [];
    return [...ids].map((id) => this.registry.get(id)!).filter(Boolean);
  }

  findByType(type: string): SkillMetadata[] {
    const ids = this.typeIndex.get(type);
    if (!ids) return [];
    return [...ids].map((id) => this.registry.get(id)!).filter(Boolean);
  }

  discover(query: string): SkillMetadata[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matched = new Set<string>();

    for (const term of terms) {
      // Check technology index
      for (const [tech, ids] of this.techIndex) {
        if (tech.includes(term)) {
          for (const id of ids) matched.add(id);
        }
      }
      // Check keyword index
      for (const [kw, ids] of this.keywordIndex) {
        if (kw.includes(term)) {
          for (const id of ids) matched.add(id);
        }
      }
      // Check type index
      for (const [type, ids] of this.typeIndex) {
        if (type.includes(term)) {
          for (const id of ids) matched.add(id);
        }
      }
    }

    return [...matched].map((id) => this.registry.get(id)!).filter(Boolean);
  }

  resolve(skillIds: string[]): ResolvedSkill[] {
    const graph = this.buildDependencyGraph(skillIds);
    const cycle = this.detectCycle(graph);
    if (cycle.length > 0) {
      throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
    }

    const order = this.kahnSort(graph);
    const resolved: ResolvedSkill[] = [];

    for (const id of order) {
      const metadata = this.registry.get(id);
      if (metadata) {
        resolved.push({
          metadata,
          content: '',
          resolution_path: order.slice(0, order.indexOf(id) + 1),
        });
      }
    }

    return resolved;
  }

  getDependencyGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const [id, skill] of this.registry) {
      graph.set(id, [...skill.dependencies]);
    }
    return graph;
  }

  detectConflicts(skillIds: string[]): ConflictReport {
    const conflicts: Array<{ skill_a: string; skill_b: string; description: string }> = [];
    const selected = skillIds.map((id) => this.registry.get(id)).filter(Boolean) as SkillMetadata[];

    for (let i = 0; i < selected.length; i++) {
      for (let j = i + 1; j < selected.length; j++) {
        const a = selected[i]!;
        const b = selected[j]!;
        if (a.conflicts_with.includes(b.skill_id)) {
          conflicts.push({
            skill_a: a.skill_id,
            skill_b: b.skill_id,
            description: `${a.name} conflicts with ${b.name}`,
          });
        }
        if (b.conflicts_with.includes(a.skill_id)) {
          conflicts.push({
            skill_a: b.skill_id,
            skill_b: a.skill_id,
            description: `${b.name} conflicts with ${a.name}`,
          });
        }
      }
    }

    return { has_conflicts: conflicts.length > 0, conflicts };
  }

  private buildDependencyGraph(skillIds: string[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    const visited = new Set<string>();
    const queue = [...skillIds];

    while (queue.length > 0) {
      const id = queue.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const skill = this.registry.get(id);
      if (!skill) {
        if (!graph.has(id)) graph.set(id, []);
        continue;
      }

      if (!graph.has(id)) graph.set(id, []);

      for (const dep of skill.dependencies) {
        // Edge from dep -> id (dependency must be resolved before dependent)
        if (!graph.has(dep)) graph.set(dep, []);
        graph.get(dep)!.push(id);
        if (!visited.has(dep)) queue.push(dep);
      }
    }

    return graph;
  }

  private detectCycle(graph: Map<string, string[]>): string[] {
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();

    for (const node of graph.keys()) color.set(node, WHITE);

    const result: string[] = [];

    const dfs = (node: string): boolean => {
      color.set(node, GRAY);
      const deps = graph.get(node) ?? [];
      for (const dep of deps) {
        if (!color.has(dep)) continue;
        if (color.get(dep) === GRAY) {
          // Found cycle, reconstruct path
          let cur: string | null = node;
          const cycle: string[] = [];
          while (cur !== null && cur !== dep) {
            cycle.unshift(cur);
            cur = parent.get(cur) ?? null;
          }
          cycle.unshift(dep);
          cycle.push(dep);
          result.push(...cycle);
          return true;
        }
        if (color.get(dep) === WHITE) {
          parent.set(dep, node);
          if (dfs(dep)) return true;
        }
      }
      color.set(node, BLACK);
      return false;
    };

    for (const node of graph.keys()) {
      if (color.get(node) === WHITE) {
        if (dfs(node)) break;
      }
    }

    return result;
  }

  private kahnSort(graph: Map<string, string[]>): string[] {
    const inDegree = new Map<string, number>();
    for (const node of graph.keys()) inDegree.set(node, 0);

    for (const [, deps] of graph) {
      for (const dep of deps) {
        if (inDegree.has(dep)) {
          inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [node, deg] of inDegree) {
      if (deg === 0) queue.push(node);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      const deps = graph.get(node) ?? [];
      for (const dep of deps) {
        const deg = inDegree.get(dep) ?? 0;
        if (deg > 0) {
          inDegree.set(dep, deg - 1);
          if (deg - 1 === 0) queue.push(dep);
        }
      }
    }

    return result;
  }
}
