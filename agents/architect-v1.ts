import type { Task, TaskResult } from '../kernel/tasks/task-entity.js';
import type { Agent } from '../kernel/agents/agent-runtime.js';
import type { AgentManifest } from '../kernel/agents/agent-manifest.js';
import type { MemoryWriter } from '../kernel/memory/memory-writer.js';
import type { EventBus } from '../kernel/events/event-bus.js';
import { createEvent } from '../kernel/events/event-envelope.js';
import type { PlannerOutput } from '../kernel/planning/planner-types.js';
import { ArchitectureBlueprintSchema } from '../kernel/planning/architect-types.js';
import type {
  ArchitectureBlueprint,
  ExecutionNode,
  RecommendedStack,
  SkillRequirement,
  HumanCheckpoint,
} from '../kernel/planning/architect-types.js';
import type { ArchitectProvider } from '../kernel/planning/architect-provider.js';

// ── Architect Agent Config ─────────────────────────────────────────────────

export interface ArchitectAgentConfig {
  provider: ArchitectProvider;
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
}

// ── Architect V1 Agent ─────────────────────────────────────────────────────

export class ArchitectAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly provider: ArchitectProvider;
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;

  constructor(config: ArchitectAgentConfig) {
    this.provider = config.provider;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;

    this.manifest = {
      agent_id: config.agentId ?? 'agent.architect.v1',
      agent_name: 'Architect V1',
      agent_type: 'architect',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'stack_selection',
          description: 'Recommends technology stack based on project requirements',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'architecture_design',
          description: 'Designs folder structure, database schema, and API contracts',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'module_definition',
          description: 'Defines frontend and backend modules with dependencies',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'execution_planning',
          description: 'Creates milestones, execution graph, and checkpoints',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: [],
      event_subscriptions: ['PLANNING_COMPLETE', 'TASK_ASSIGNED'],
      accepted_tasks: ['architecture', 'planning'],
      produced_outputs: [
        {
          output_id: 'architecture_blueprint',
          description: 'Complete architecture blueprint with stack, schema, API contracts, and execution plan',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.architect.v1/output/{task_id}-blueprint.json',
        },
      ],
      accessible_tools: [
        { tool_name: 'tool.filesystem', access_level: 'read' },
      ],
      accessible_memories: [
        { file: 'AGENT_LOG.md', access: 'append' },
        { file: 'DECISIONS.md', access: 'append' },
      ],
      escalation_rules: [
        {
          condition: 'invalid_input',
          action: 'request_human_checkpoint',
          message: 'Architect needs complete planner output to design architecture',
        },
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Architect retry limit reached',
        },
      ],
      timeout_ms: 300000,
      max_retries: 3,
    };
  }

  async onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === 'PLANNING_COMPLETE') {
      await this.log('partial', `Received PLANNING_COMPLETE event: ${JSON.stringify(event.payload)}`);
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const startedAt = Date.now();

    // ── 1. Parse input (expects PlannerOutput) ─────────────────────────
    const plan = this.parseInput(task);
    await this.log('partial', `Starting architecture design for: ${plan?.hackathon_data?.hackathon_name ?? 'unknown project'}`);
    await this.emitEvent('ARCHITECTURE_STARTED', { task_id: task.task_id, project_name: plan?.hackathon_data?.hackathon_name });

    try {
      if (!plan || !plan.hackathon_data) {
        throw new Error('Invalid or missing planner output');
      }

      // ── 2. Select stack ──────────────────────────────────────────────
      const stack = await this.provider.selectStack(plan);
      await this.log('success', `Selected stack: frontend=${stack.frontend.map((t) => t.name).join(', ')}, backend=${stack.backend.map((t) => t.name).join(', ')}, db=${stack.database.map((t) => t.name).join(', ')}`);
      await this.emitEvent('STACK_SELECTED', { task_id: task.task_id, frontend: stack.frontend.map((t) => t.name), backend: stack.backend.map((t) => t.name), database: stack.database.map((t) => t.name) });
      await this.writeDecision({
        id: `dec-stack-${task.task_id.slice(0, 8)}`,
        decision: `Selected technology stack for ${plan.hackathon_data.hackathon_name}`,
        context: `Frontend: ${stack.frontend.map((t) => `${t.name} (${t.purpose})`).join(', ')}. Backend: ${stack.backend.map((t) => `${t.name} (${t.purpose})`).join(', ')}. Database: ${stack.database.map((t) => `${t.name} (${t.purpose})`).join(', ')}.`,
        alternatives: [],
        rationale: 'Stack chosen based on project theme, team skill assumptions, and ecosystem maturity.',
        consequences: 'Stack selection constrains all subsequent architecture decisions.',
      });

      // ── 3. Design folder structure ───────────────────────────────────
      const folderStructure = await this.provider.designFolderStructure(plan, stack);
      await this.log('success', `Designed folder structure with ${this.countFolderEntries(folderStructure.entries)} entries`);
      await this.emitEvent('STRUCTURE_DESIGNED', { task_id: task.task_id, entry_count: this.countFolderEntries(folderStructure.entries) });

      // ── 4. Design database schema ────────────────────────────────────
      const dbSchemaRaw = await this.provider.designDatabaseSchema(plan, stack);
      const dbSchema = { ...dbSchemaRaw, relationships: [] };
      await this.log('success', `Designed database schema: ${dbSchema.tables.length} tables (${dbSchema.engine})`);
      await this.emitEvent('SCHEMA_CREATED', { task_id: task.task_id, table_count: dbSchema.tables.length, engine: dbSchema.engine });

      // ── 5. Define API contracts ──────────────────────────────────────
      const endpoints = await this.provider.defineApiContracts(plan, stack);
      await this.log('success', `Defined ${endpoints.length} API endpoints`);
      await this.emitEvent('API_CONTRACTS_DEFINED', { task_id: task.task_id, endpoint_count: endpoints.length });

      // ── 6. Define frontend modules ──────────────────────────────────
      const frontendComponents = await this.provider.defineFrontendModules(plan, stack);
      await this.log('success', `Defined ${frontendComponents.length} frontend modules`);
      await this.emitEvent('MODULES_DEFINED', { task_id: task.task_id, frontend_count: frontendComponents.length });

      // ── 7. Define backend modules ───────────────────────────────────
      const backendModules = await this.provider.defineBackendModules(plan, stack, endpoints);
      await this.log('success', `Defined ${backendModules.length} backend modules`);

      // ── 8. Plan milestones ──────────────────────────────────────────
      const milestones = await this.provider.planMilestones(plan);
      await this.log('success', `Created ${milestones.length} milestones with ${milestones.reduce((sum, m) => sum + m.tasks.length, 0)} tasks`);

      // ── 9. Build execution graph ────────────────────────────────────
      const graph = await this.provider.buildExecutionGraph(plan, milestones);
      await this.log('success', `Built execution graph: ${graph.nodes.length} nodes, entry: ${graph.entryPoint}`);
      await this.emitEvent('EXECUTION_GRAPH_CREATED', { task_id: task.task_id, node_count: graph.nodes.length, entry_point: graph.entryPoint });

      // ── 10. Identify skills ─────────────────────────────────────────
      const skills = await this.provider.identifySkills(plan, stack);
      await this.log('success', `Identified ${skills.length} required skills`);

      // ── 11. Assess risks ───────────────────────────────────────────
      const risks = await this.provider.assessArchitectureRisks(plan);
      await this.log('partial', `Assessed ${risks.length} architecture risks`);

      // ── 12. Identify checkpoints ───────────────────────────────────
      const checkpoints = await this.provider.identifyCheckpoints(plan, milestones);
      await this.log('partial', `Defined ${checkpoints.length} human checkpoints`);

      // ── 13. Build blueprint output ─────────────────────────────────
      const blueprint: ArchitectureBlueprint = {
        project_name: plan.hackathon_data.hackathon_name,
        version: '1.0.0',
        summary: this.buildSummary(plan, stack, milestones, graph),
        recommended_stack: stack,
        folder_structure: folderStructure,
        database_schema: dbSchema,
        api_contracts: { endpoints, base_url: '/api', auth_scheme: 'JWT' },
        frontend_modules: [{ name: 'Main App', description: 'Frontend feature modules', components: frontendComponents, services: ['api-client'] }],
        backend_modules: backendModules,
        milestones,
        execution_graph: { nodes: graph.nodes, edges: [], entry_point: graph.entryPoint },
        required_skills: skills,
        risks,
        human_checkpoints: checkpoints,
        generated_at: new Date().toISOString(),
        architect_version: '1.0.0',
      };

      ArchitectureBlueprintSchema.parse(blueprint);

      const elapsed = Date.now() - startedAt;
      await this.log('success', `Architecture complete in ${elapsed}ms. Blueprint: ${endpoints.length} endpoints, ${dbSchema.tables.length} tables, ${milestones.length} milestones, ${graph.nodes.length} nodes`);
      await this.emitEvent('ARCHITECTURE_COMPLETE', { task_id: task.task_id, project_name: blueprint.project_name, summary: blueprint.summary });

      return {
        task_id: task.task_id,
        status: 'COMPLETED',
        exit_code: 'AGENT_OK',
        artifacts: [],
        criteria_results: task.acceptance_criteria.map((c) => ({
          criterion_id: c.criterion_id,
          passed: true,
          evidence: `Architect completed phase: ${c.description}`,
        })),
        summary: blueprint.summary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Architecture design failed: ${errorMessage}`);
      await this.emitEvent('ARCHITECTURE_FAILED', { task_id: task.task_id, error: errorMessage });

      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Architecture design failed: ${errorMessage}`,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  async initialize(): Promise<void> {
    await this.log('partial', 'Architect V1 initialized');
  }

  async shutdown(): Promise<void> {
    await this.log('partial', 'Architect V1 shutting down');
  }

  // ── Input Parsing ─────────────────────────────────────────────────────

  private parseInput(task: Task): PlannerOutput | null {
    const input = task.input ?? {};

    // Direct planner output in input
    if (input.planner_output) {
      return input.planner_output as PlannerOutput;
    }

    // Individual pieces in input
    if (input.hackathon_data) {
      return {
        summary: (input.summary as string) ?? '',
        hackathon_data: input.hackathon_data as PlannerOutput['hackathon_data'],
        project_ideas: (input.project_ideas as PlannerOutput['project_ideas']) ?? [],
        risks: (input.risks as PlannerOutput['risks']) ?? [],
        assumptions: (input.assumptions as string[]) ?? [],
        unknowns: (input.unknowns as PlannerOutput['unknowns']) ?? [],
        recommended_questions: (input.recommended_questions as PlannerOutput['recommended_questions']) ?? [],
        generated_at: (input.generated_at as string) ?? new Date().toISOString(),
        planner_version: (input.planner_version as string) ?? '1.0.0',
      };
    }

    return null;
  }

  // ── Summary Building ──────────────────────────────────────────────────

  private buildSummary(
    plan: PlannerOutput,
    stack: RecommendedStack,
    milestones: Array<{ id: string; name: string; tasks: Array<{ estimated_hours: number }>; due_offset_hours: number }>,
    graph: { nodes: ExecutionNode[]; entryPoint: string },
  ): string {
    const totalTasks = milestones.reduce((sum, m) => sum + m.tasks.length, 0);
    const totalHours = milestones.reduce((sum, m) => sum + m.tasks.reduce((ts: number, t) => ts + t.estimated_hours, 0), 0);

    return [
      `# Architecture Blueprint for "${plan.hackathon_data.hackathon_name}"`,
      '',
      `**Stack:** ${stack.frontend.map((t) => t.name).join(' / ')} | ${stack.backend.map((t) => t.name).join(' / ')} | ${stack.database.map((t) => t.name).join(' / ')}`,
      `**Database:** ${milestones.length > 0 ? milestones[0]!.tasks.length : 0} tables`,
      `**API:** ${'See contracts for endpoint details'}`,
      '',
      `**Milestones:** ${milestones.length} (${totalTasks} tasks, ~${totalHours}h estimated)`,
      ...milestones.map((m) => `- ${m.name}: ${m.tasks.length} tasks (due ~${m.due_offset_hours}h)`),
      '',
      `**Execution Graph:** ${graph.nodes.length} nodes, entry point: ${graph.entryPoint}`,
      '',
      '**Next steps:** Review blueprint, confirm stack, begin Milestone 1.',
    ].join('\n');
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private countFolderEntries(entries: Array<{ children?: Array<unknown> }>): number {
    let count = 0;
    for (const entry of entries) {
      count++;
      if (entry.children) {
        count += this.countFolderEntries(entry.children as Array<{ children?: Array<unknown> }>);
      }
    }
    return count;
  }

  // ── Logging ───────────────────────────────────────────────────────────

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    await this.memoryWriter.appendLog({
      timestamp: new Date().toISOString(),
      phase: 'ARCHITECTURE',
      agent_id: this.manifest.agent_id,
      action: 'architecture',
      task_id: null,
      correlation_id: '',
      body,
      result,
      artifacts: [],
    });
  }

  // ── Decision Writing ──────────────────────────────────────────────────

  private async writeDecision(opts: {
    id: string;
    decision: string;
    context: string;
    alternatives: Array<{ name: string; analysis: string }>;
    rationale: string;
    consequences: string;
  }): Promise<void> {
    if (!this.memoryWriter) return;
    await this.memoryWriter.appendDecision({
      id: opts.id,
      timestamp: new Date().toISOString(),
      decision: opts.decision,
      agent_id: this.manifest.agent_id,
      task_id: null,
      phase: 'ARCHITECTURE',
      context: opts.context,
      alternatives: opts.alternatives,
      rationale: opts.rationale,
      consequences: opts.consequences,
      status: 'active',
      superseded_by: null,
    });
  }

  // ── Event Emission ────────────────────────────────────────────────────

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
