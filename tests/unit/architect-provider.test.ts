import { describe, it, expect } from 'vitest';

import { MockArchitectProvider } from '../../kernel/planning/architect-provider.js';
import type { PlannerOutput } from '../../kernel/planning/planner-types.js';

function createSamplePlannerOutput(): PlannerOutput {
  return {
    summary: 'Planning complete',
    hackathon_data: {
      hackathon_name: 'AI Innovation Hackathon',
      theme: 'AI/ML',
      tracks: [
        { name: 'General', description: 'Open track' },
        { name: 'AI/ML', description: 'AI track' },
      ],
      judging_criteria: [{ name: 'Creativity', weight: 50, description: 'Creative ideas' }],
      sponsor_technologies: [],
      timeline: { submission_deadline: 'July 15, 2026' },
      submission_requirements: [{ category: 'Code', description: 'GitHub link', required: true }],
      description: 'Build AI solutions for real-world problems.',
    },
    project_ideas: [
      {
        id: 'idea-001',
        title: 'AI Assistant',
        description: 'An AI assistant',
        tracks: ['AI/ML'],
        difficulty: 7,
        innovation: 8,
        estimated_build_time_hours: 24,
        risks: ['LLM complexity'],
        key_features: ['NLP', 'Real-time'],
        required_skills: ['TypeScript', 'React', 'Python'],
        sponsor_technology_used: [],
      },
      {
        id: 'idea-002',
        title: 'Analytics Dashboard',
        description: 'Data dashboard',
        tracks: ['General'],
        difficulty: 5,
        innovation: 6,
        estimated_build_time_hours: 16,
        risks: ['Data sources'],
        key_features: ['Charts', 'Export'],
        required_skills: ['TypeScript', 'React', 'D3.js'],
        sponsor_technology_used: [],
      },
    ],
    risks: [],
    assumptions: ['Team is comfortable with TypeScript'],
    unknowns: [],
    recommended_questions: [],
    generated_at: new Date().toISOString(),
    planner_version: '1.0.0',
  };
}

describe('MockArchitectProvider', () => {
  const provider = new MockArchitectProvider();
  const plan = createSamplePlannerOutput();

  describe('selectStack', () => {
    it('returns a complete recommended stack', async () => {
      const stack = await provider.selectStack(plan);
      expect(stack.frontend.length).toBeGreaterThanOrEqual(3);
      expect(stack.backend.length).toBeGreaterThanOrEqual(2);
      expect(stack.database.length).toBeGreaterThanOrEqual(1);
      expect(stack.infrastructure.length).toBeGreaterThanOrEqual(1);
      expect(stack.tooling.length).toBeGreaterThanOrEqual(1);
    });

    it('selects Python backend for AI-themed hackathons', async () => {
      const stack = await provider.selectStack(plan);
      const hasPython = stack.backend.some((b) => b.name.toLowerCase().includes('python'));
      expect(hasPython).toBe(true);
    });

    it('each technology has name, purpose, and alternatives', async () => {
      const stack = await provider.selectStack(plan);
      for (const category of [stack.frontend, stack.backend, stack.database]) {
        for (const tech of category) {
          expect(tech.name).toBeDefined();
          expect(tech.purpose).toBeDefined();
          expect(Array.isArray(tech.alternatives)).toBe(true);
        }
      }
    });
  });

  describe('designFolderStructure', () => {
    it('returns a folder structure with root and entries', async () => {
      const stack = await provider.selectStack(plan);
      const structure = await provider.designFolderStructure(plan, stack);
      expect(structure.root).toBe('/project');
      expect(structure.entries.length).toBeGreaterThan(0);
    });

    it('includes src, tests, infra, and docs directories', async () => {
      const stack = await provider.selectStack(plan);
      const structure = await provider.designFolderStructure(plan, stack);
      const paths = structure.entries.map((e: any) => e.path);
      expect(paths.some((p: any) => p.includes('tests'))).toBe(true);
      expect(paths.some((p) => p.includes('infra'))).toBe(true);
      expect(paths.some((p) => p.includes('docs'))).toBe(true);
    });
  });

  describe('designDatabaseSchema', () => {
    it('returns tables with columns and indexes', async () => {
      const stack = await provider.selectStack(plan);
      const db = await provider.designDatabaseSchema(plan, stack);
      expect(db.engine).toBeDefined();
      expect(db.tables.length).toBeGreaterThan(0);
      for (const table of db.tables) {
        expect(table.columns.length).toBeGreaterThan(0);
      }
    });

    it('includes users, projects, and tasks tables', async () => {
      const stack = await provider.selectStack(plan);
      const db = await provider.designDatabaseSchema(plan, stack);
      const tableNames = db.tables.map((t) => t.name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('projects');
      expect(tableNames).toContain('tasks');
    });
  });

  describe('defineApiContracts', () => {
    it('returns API endpoints with required fields', async () => {
      const stack = await provider.selectStack(plan);
      const endpoints = await provider.defineApiContracts(plan, stack);
      expect(endpoints.length).toBeGreaterThan(0);
      for (const ep of endpoints) {
        expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(ep.method);
        expect(ep.path).toBeDefined();
        expect(ep.description).toBeDefined();
      }
    });

    it('includes auth and health endpoints', async () => {
      const stack = await provider.selectStack(plan);
      const endpoints = await provider.defineApiContracts(plan, stack);
      const paths = endpoints.map((e) => e.path);
      expect(paths.some((p) => p.includes('auth'))).toBe(true);
      expect(paths.some((p) => p.includes('health'))).toBe(true);
    });
  });

  describe('defineFrontendModules', () => {
    it('returns frontend components with dependencies', async () => {
      const stack = await provider.selectStack(plan);
      const components = await provider.defineFrontendModules(plan, stack);
      expect(components.length).toBeGreaterThan(0);
      for (const comp of components) {
        expect(comp.name).toBeDefined();
        expect(comp.description).toBeDefined();
      }
    });
  });

  describe('defineBackendModules', () => {
    it('returns backend modules with endpoints and env vars', async () => {
      const stack = await provider.selectStack(plan);
      const endpoints = await provider.defineApiContracts(plan, stack);
      const modules = await provider.defineBackendModules(plan, stack, endpoints);
      expect(modules.length).toBeGreaterThan(0);
      for (const mod of modules) {
        expect(mod.name).toBeDefined();
        expect(mod.description).toBeDefined();
        expect(Array.isArray(mod.endpoints)).toBe(true);
      }
    });
  });

  describe('planMilestones', () => {
    it('returns 5 milestones with tasks', async () => {
      const milestones = await provider.planMilestones(plan);
      expect(milestones).toHaveLength(5);
      for (const ms of milestones) {
        expect(ms.tasks.length).toBeGreaterThan(0);
        expect(ms.deliverables.length).toBeGreaterThan(0);
      }
    });
  });

  describe('buildExecutionGraph', () => {
    it('returns nodes with an entry point', async () => {
      const milestones = await provider.planMilestones(plan);
      const graph = await provider.buildExecutionGraph(plan, milestones);
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.entryPoint).toBeDefined();
    });

    it('all nodes have valid types', async () => {
      const milestones = await provider.planMilestones(plan);
      const graph = await provider.buildExecutionGraph(plan, milestones);
      const validTypes = ['task', 'decision', 'parallel', 'checkpoint', 'subprocess'];
      for (const node of graph.nodes) {
        expect(validTypes).toContain(node.type);
      }
    });
  });

  describe('identifySkills', () => {
    it('returns skill requirements with levels', async () => {
      const stack = await provider.selectStack(plan);
      const skills = await provider.identifySkills(plan, stack);
      expect(skills.length).toBeGreaterThan(0);
      for (const skill of skills) {
        expect(['beginner', 'intermediate', 'advanced', 'expert']).toContain(skill.level);
        expect(skill.skill).toBeDefined();
      }
    });
  });

  describe('assessArchitectureRisks', () => {
    it('returns risks with valid categories', async () => {
      const risks = await provider.assessArchitectureRisks(plan);
      expect(risks.length).toBeGreaterThan(0);
      const validCategories = ['technical', 'time', 'scope', 'team', 'external'];
      for (const risk of risks) {
        expect(validCategories).toContain(risk.category);
        expect(['low', 'medium', 'high']).toContain(risk.severity);
      }
    });
  });

  describe('identifyCheckpoints', () => {
    it('returns checkpoints with options', async () => {
      const milestones = await provider.planMilestones(plan);
      const checkpoints = await provider.identifyCheckpoints(plan, milestones);
      expect(checkpoints.length).toBeGreaterThan(0);
      for (const cp of checkpoints) {
        expect(cp.id).toBeDefined();
        expect(cp.phase).toBeDefined();
        expect(cp.question).toBeDefined();
      }
    });
  });
});
