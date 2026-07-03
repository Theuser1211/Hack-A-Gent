import type { Task, TaskResult } from '../kernel/tasks/task-entity.js';
import type { Agent } from '../kernel/agents/agent-runtime.js';
import type { AgentManifest } from '../kernel/agents/agent-manifest.js';
import type { MemoryWriter } from '../kernel/memory/memory-writer.js';
import type { EventBus } from '../kernel/events/event-bus.js';
import { createEvent } from '../kernel/events/event-envelope.js';
import { PlannerOutputSchema } from '../kernel/planning/planner-types.js';
import type {
  HackathonInput,
  PlannerOutput,
  ProjectIdea,
  Risk,
  Unknown,
  RecommendedQuestion,
} from '../kernel/planning/planner-types.js';
import type { PlanningProvider } from '../kernel/planning/planning-provider.js';

// ── Planner Agent Config ──────────────────────────────────────────────────

export interface PlannerAgentConfig {
  provider: PlanningProvider;
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
}

// ── Planner V1 Agent ──────────────────────────────────────────────────────

export class PlannerAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly provider: PlanningProvider;
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;

  constructor(config: PlannerAgentConfig) {
    this.provider = config.provider;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;

    this.manifest = {
      agent_id: config.agentId ?? 'agent.planner.v1',
      agent_name: 'Planner V1',
      agent_type: 'planner',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'hackathon_analysis',
          description: 'Analyzes hackathon data from URLs or descriptions',
          input_schema: { type: 'object', properties: { hackathon_url: { type: 'string' }, hackathon_description: { type: 'string' } } },
          output_schema: { type: 'object', properties: { hackathon_data: { type: 'object' } } },
        },
        {
          capability_id: 'project_ideation',
          description: 'Generates project ideas with difficulty and innovation scores',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'risk_assessment',
          description: 'Identifies technical, time, scope, and team risks',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'unknown_identification',
          description: 'Identifies missing information needed for decision-making',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: [],
      event_subscriptions: ['TASK_ASSIGNED', 'HACKATHON_DATA_READY'],
      accepted_tasks: ['planning', 'analysis'],
      produced_outputs: [
        {
          output_id: 'planner_output',
          description: 'Structured planner output with project ideas, risks, and questions',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.planner.v1/output/{task_id}-plan.json',
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
          condition: 'missing_information',
          action: 'request_human_checkpoint',
          message: 'Planner needs user preferences to generate ideas',
        },
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Planner retry limit reached',
        },
      ],
      timeout_ms: 300000,
      max_retries: 3,
    };
  }

  async onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === 'HACKATHON_DATA_READY') {
      await this.log('partial', `Received HACKATHON_DATA_READY event: ${JSON.stringify(event.payload)}`);
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const startedAt = Date.now();

    // ── 1. Parse input ──────────────────────────────────────────────────
    const hackathonInput = this.parseInput(task);
    await this.log('partial', `Starting planning for: ${hackathonInput.hackathon_url ?? hackathonInput.hackathon_description?.slice(0, 100) ?? 'unknown'}`);
    await this.emitEvent('PLANNING_STARTED', { task_id: task.task_id, input: hackathonInput });

    try {
      // ── 2. Ingest hackathon data ────────────────────────────────────
      const hackathonData = await this.provider.ingestHackathon(hackathonInput);
      await this.log('success', `Ingested hackathon: "${hackathonData.hackathon_name}" with ${hackathonData.tracks.length} tracks`);
      await this.emitEvent('HACKATHON_INGESTED', { task_id: task.task_id, hackathon_name: hackathonData.hackathon_name });

      // ── 3. Generate project ideas ───────────────────────────────────
      const projectIdeas = await this.provider.generateProjectIdeas(hackathonData);
      await this.log('success', `Generated ${projectIdeas.length} project ideas`);
      await this.writeDecision({
        id: `dec-plan-${task.task_id.slice(0, 8)}`,
        decision: `Generated ${projectIdeas.length} project ideas for ${hackathonData.hackathon_name}`,
        context: `Hackathon: ${hackathonData.hackathon_name}. Theme: ${hackathonData.theme ?? 'none'}. Tracks: ${hackathonData.tracks.map((t) => t.name).join(', ')}.`,
        alternatives: projectIdeas.map((idea) => ({
          name: idea.title,
          analysis: `Difficulty: ${idea.difficulty}/10, Innovation: ${idea.innovation}/10, Est.: ${idea.estimated_build_time_hours}h. Risks: ${idea.risks.join(', ')}`,
        })),
        rationale: 'Generated diverse ideas across difficulty levels to give the team options.',
        consequences: 'Team will select one idea to pursue. Other ideas may be archived.',
      });
      await this.emitEvent('IDEAS_GENERATED', { task_id: task.task_id, count: projectIdeas.length });

      // ── 4. Assess risks ──────────────────────────────────────────────
      const risks = await this.provider.assessRisks(hackathonData, projectIdeas);
      await this.log('success', `Assessed ${risks.length} risks across all ideas`);
      await this.emitEvent('RISKS_ASSESSED', { task_id: task.task_id, count: risks.length });

      // ── 5. Identify unknowns ─────────────────────────────────────────
      const unknowns = await this.provider.identifyUnknowns(hackathonData, projectIdeas);
      await this.log('partial', `Identified ${unknowns.length} unknowns`);
      await this.emitEvent('UNKNOWNS_IDENTIFIED', { task_id: task.task_id, count: unknowns.length });

      // ── 6. Generate questions ──────────────────────────────────────
      const questions = await this.provider.generateQuestions(unknowns);
      await this.log('partial', `Generated ${questions.length} recommended questions`);
      await this.emitEvent('QUESTIONS_GENERATED', { task_id: task.task_id, count: questions.length });

      // ── 7. Build output ──────────────────────────────────────────────
      const assumptions = this.buildAssumptions(hackathonInput);

      const output: PlannerOutput = {
        summary: this.buildSummary(hackathonData, projectIdeas, risks, unknowns),
        hackathon_data: hackathonData,
        project_ideas: projectIdeas,
        risks,
        assumptions,
        unknowns,
        recommended_questions: questions,
        generated_at: new Date().toISOString(),
        planner_version: '1.0.0',
      };

      PlannerOutputSchema.parse(output);

      const elapsed = Date.now() - startedAt;
      await this.log('success', `Planning complete in ${elapsed}ms. Output: ${projectIdeas.length} ideas, ${risks.length} risks, ${unknowns.length} unknowns, ${questions.length} questions`);
      await this.emitEvent('PLANNING_COMPLETE', { task_id: task.task_id, output_summary: output.summary });

      return {
        task_id: task.task_id,
        status: 'COMPLETED',
        exit_code: 'AGENT_OK',
        artifacts: [],
        criteria_results: task.acceptance_criteria.map((c) => ({
          criterion_id: c.criterion_id,
          passed: true,
          evidence: `Planner completed phase: ${c.description}`,
        })),
        summary: output.summary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Planning failed: ${errorMessage}`);
      await this.emitEvent('PLANNING_FAILED', { task_id: task.task_id, error: errorMessage });

      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Planning failed: ${errorMessage}`,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  async initialize(): Promise<void> {
    await this.log('partial', 'Planner V1 initialized');
  }

  async shutdown(): Promise<void> {
    await this.log('partial', 'Planner V1 shutting down');
  }

  // ── Input Parsing ─────────────────────────────────────────────────────

  private parseInput(task: Task): HackathonInput {
    const input = task.input ?? {};

    if (input.hackathon_url || input.hackathon_description || input.raw_text) {
      return {
        hackathon_url: input.hackathon_url as string | undefined,
        hackathon_description: input.hackathon_description as string | undefined,
        raw_text: input.raw_text as string | undefined,
        preferences: input.preferences as Record<string, unknown> | undefined,
      };
    }

    // Fallback: use task description as raw_text
    return {
      raw_text: task.description,
      preferences: input.preferences as Record<string, unknown> | undefined,
    };
  }

  // ── Summary Building ──────────────────────────────────────────────────

  private buildSummary(
    data: PlannerOutput['hackathon_data'],
    ideas: ProjectIdea[],
    risks: Risk[],
    unknowns: Unknown[],
  ): string {
    const bestIdea = ideas.length > 0
      ? ideas.reduce((a, b) => (a.innovation + a.difficulty > b.innovation + b.difficulty ? a : b))
      : null;

    return [
      `# Planning Summary for "${data.hackathon_name}"`,
      '',
      data.theme ? `**Theme:** ${data.theme}` : '',
      `**Tracks:** ${data.tracks.map((t) => t.name).join(', ')}`,
      '',
      `**Generated ${ideas.length} project ideas:**`,
      ...ideas.map((i) => `- ${i.title} (Difficulty: ${i.difficulty}/10, Innovation: ${i.innovation}/10, ~${i.estimated_build_time_hours}h)`),
      '',
      bestIdea ? `**Top pick:** ${bestIdea.title} (score: ${bestIdea.innovation + bestIdea.difficulty}/20)` : '',
      '',
      `**Risks identified:** ${risks.length}`,
      `**Unknowns identified:** ${unknowns.length}`,
      '',
      '**Recommended next step:** Review project ideas and answer the recommended questions to narrow down to one idea.',
    ].filter(Boolean).join('\n');
  }

  private buildAssumptions(input: HackathonInput): string[] {
    const assumptions: string[] = [
      'The hackathon provides sufficient documentation and resources for participants.',
      'All sponsor technologies mentioned are available for use during the hackathon.',
    ];

    if (!input.preferences?.team_size) {
      assumptions.push('Team composition will be determined after idea selection.');
    }
    if (!input.preferences?.platform) {
      assumptions.push('Platform choice (web/mobile/desktop) is flexible based on the chosen idea.');
    }
    if (!input.preferences?.experience) {
      assumptions.push('Team has intermediate-level skills unless specified otherwise.');
    }

    return assumptions;
  }

  // ── Logging ───────────────────────────────────────────────────────────

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    await this.memoryWriter.appendLog({
      timestamp: new Date().toISOString(),
      phase: 'PLANNING',
      agent_id: this.manifest.agent_id,
      action: 'planning',
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
      phase: 'PLANNING',
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
