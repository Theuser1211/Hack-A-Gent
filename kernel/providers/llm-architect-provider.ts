import type { ContextEngine } from '../context/context-engine.js';
import type { LLMRequest } from '../llm/llm-types.js';
import type { RouterEngine } from '../llm/router-engine.js';
import type { ArchitectProvider } from '../planning/architect-provider.js';
import { RecommendedStackSchema } from '../planning/architect-types.js';
import type {
  RecommendedStack,
  FolderStructure,
  Table,
  RequestSchema,
  Component,
  ExecutionNode,
  SkillRequirement,
  HumanCheckpoint,
  ArchitectureBlueprint,
} from '../planning/architect-types.js';
import type { PlannerOutput } from '../planning/planner-types.js';
import type { PromptEngine } from '../prompts/prompt-engine.js';
import { extractJSON } from './json-extractor.js';
import {
  FolderStructureSchema,
  DatabaseSchemaSchema,
  RequestSchemaArraySchema,
  ComponentArraySchema,
  BackendModuleArraySchema,
  MilestoneArraySchema,
  ExecutionGraphSchema,
  SkillRequirementArraySchema,
  ArchitectureRiskArraySchema,
  HumanCheckpointArraySchema,
} from './llm-output-schemas.js';

export class LLMArchitectProvider implements ArchitectProvider {
  private router: RouterEngine;
  private prompts: PromptEngine;
  private context: ContextEngine;
  private taskType: string = 'architecture';

  constructor(router: RouterEngine, prompts: PromptEngine, context: ContextEngine) {
    this.router = router;
    this.prompts = prompts;
    this.context = context;
  }

  async selectStack(plan: PlannerOutput): Promise<RecommendedStack> {
    this.prompts.setComponentContent('agent_role', 'You are a software architecture stack selection specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Recommend a tech stack for the given project plan. Return a JSON object with frontend, backend, database, infrastructure, and tooling arrays. Each entry should have name, version, purpose, alternatives, and rationale.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 3000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    return extractJSON(response.content, { schema: RecommendedStackSchema, provider: response.provider, model: response.model_id, stage: 'selectStack' }) as RecommendedStack;
  }

  async designFolderStructure(plan: PlannerOutput, stack: RecommendedStack): Promise<FolderStructure> {
    this.prompts.setComponentContent('agent_role', 'You are a project structure design specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Design a folder structure for the project. Return a JSON object with root and entries array. Each entry should have path, type (dir/file), description, and optional children array with the same structure.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}\n\nStack:\n${JSON.stringify(stack, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 3000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    return extractJSON(response.content, { schema: FolderStructureSchema, provider: response.provider, model: response.model_id, stage: 'designFolderStructure' }) as FolderStructure;
  }

  async designDatabaseSchema(
    plan: PlannerOutput,
    stack: RecommendedStack,
  ): Promise<{ engine: string; tables: Table[] }> {
    this.prompts.setComponentContent('agent_role', 'You are a database schema design specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Design a database schema for the project. Return a JSON object with engine (string) and tables array. Each table should have name, columns (name, type, nullable, primary_key, unique, default, references), indexes, and description.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}\n\nStack:\n${JSON.stringify(stack, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 4000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    return extractJSON(response.content, { schema: DatabaseSchemaSchema, provider: response.provider, model: response.model_id, stage: 'designDatabaseSchema' }) as { engine: string; tables: Table[] };
  }

  async defineApiContracts(plan: PlannerOutput, stack: RecommendedStack): Promise<RequestSchema[]> {
    this.prompts.setComponentContent('agent_role', 'You are an API contract design specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Define API contracts for the project. Return a JSON array of endpoint definitions. Each should have method, path, description, auth_required, request_body, response_body, query_params, path_params, and error_responses.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}\n\nStack:\n${JSON.stringify(stack, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 4000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed4 = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'defineApiContracts' });
    const endpoints = Array.isArray(parsed4) ? parsed4 : ((parsed4 as Record<string, unknown>).endpoints ?? []);
    const validated4 = RequestSchemaArraySchema.safeParse(endpoints);
    return (validated4.success ? validated4.data : endpoints) as RequestSchema[];
  }

  async defineFrontendModules(plan: PlannerOutput, stack: RecommendedStack): Promise<Component[]> {
    this.prompts.setComponentContent('agent_role', 'You are a frontend architecture design specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Define frontend components/modules for the project. Return a JSON array of component definitions. Each should have name, description, props (name, type, required), state_management, and dependencies.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}\n\nStack:\n${JSON.stringify(stack, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 3000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed5 = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'defineFrontendModules' });
    const components = Array.isArray(parsed5) ? parsed5 : ((parsed5 as Record<string, unknown>).components ?? []);
    const validated5 = ComponentArraySchema.safeParse(components);
    return (validated5.success ? validated5.data : components) as Component[];
  }

  async defineBackendModules(
    plan: PlannerOutput,
    stack: RecommendedStack,
    endpoints: RequestSchema[],
  ): Promise<
    Array<{
      name: string;
      description: string;
      endpoints: string[];
      dependencies: string[];
      environment_variables: Array<{ name: string; description: string; required: boolean }>;
    }>
  > {
    this.prompts.setComponentContent('agent_role', 'You are a backend architecture design specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Define backend service modules for the project. Return a JSON array of module definitions. Each should have name, description, endpoints, dependencies, and environment_variables (name, description, required).',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}\n\nStack:\n${JSON.stringify(stack, null, 2)}\n\nEndpoints:\n${JSON.stringify(endpoints, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 3000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed6 = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'defineBackendModules' });
    const modules = Array.isArray(parsed6) ? parsed6 : ((parsed6 as Record<string, unknown>).modules ?? []);
    const validated6 = BackendModuleArraySchema.safeParse(modules);
    return (validated6.success ? validated6.data : modules) as Array<{
      name: string;
      description: string;
      endpoints: string[];
      dependencies: string[];
      environment_variables: Array<{ name: string; description: string; required: boolean }>;
    }>;
  }

  async planMilestones(plan: PlannerOutput): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      due_offset_hours: number;
      tasks: Array<{ id: string; description: string; estimated_hours: number; depends_on: string[] }>;
      deliverables: string[];
      verification?: string;
    }>
  > {
    this.prompts.setComponentContent('agent_role', 'You are a project milestone planning specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Plan development milestones for the project. Return a JSON array of milestones with id, name, description, due_offset_hours, tasks (id, description, estimated_hours, depends_on), deliverables, and optional verification.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 4000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed7 = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'planMilestones' });
    const milestones = Array.isArray(parsed7) ? parsed7 : ((parsed7 as Record<string, unknown>).milestones ?? []);
    const validated7 = MilestoneArraySchema.safeParse(milestones);
    return (validated7.success ? validated7.data : milestones) as Array<{
      id: string;
      name: string;
      description: string;
      due_offset_hours: number;
      tasks: Array<{ id: string; description: string; estimated_hours: number; depends_on: string[] }>;
      deliverables: string[];
      verification?: string;
    }>;
  }

  async buildExecutionGraph(
    plan: PlannerOutput,
    milestones: Array<unknown>,
  ): Promise<{ nodes: ExecutionNode[]; entryPoint: string }> {
    this.prompts.setComponentContent('agent_role', 'You are an execution graph design specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Build an execution graph for the project. Return a JSON object with nodes array (id, label, type (task/decision/subprocess/checkpoint/parallel), estimated_duration_minutes, depends_on) and entryPoint string.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}\n\nMilestones:\n${JSON.stringify(milestones, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 3000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    return extractJSON(response.content, { schema: ExecutionGraphSchema, provider: response.provider, model: response.model_id, stage: 'buildExecutionGraph' }) as { nodes: ExecutionNode[]; entryPoint: string };
  }

  async identifySkills(plan: PlannerOutput, stack: RecommendedStack): Promise<SkillRequirement[]> {
    this.prompts.setComponentContent('agent_role', 'You are a skill requirements identification specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Identify skill requirements for the project. Return a JSON array of SkillRequirement objects with skill, level (beginner/intermediate/advanced/expert), required (boolean), and notes.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}\n\nStack:\n${JSON.stringify(stack, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 2000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed9 = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'identifySkills' });
    const skills = Array.isArray(parsed9) ? parsed9 : ((parsed9 as Record<string, unknown>).skills ?? []);
    const validated9 = SkillRequirementArraySchema.safeParse(skills);
    return (validated9.success ? validated9.data : skills) as SkillRequirement[];
  }

  async assessArchitectureRisks(plan: PlannerOutput): Promise<ArchitectureBlueprint['risks']> {
    this.prompts.setComponentContent('agent_role', 'You are an architecture risk assessment specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Assess architecture risks for the project. Return a JSON array of risk objects with category, description, severity (low/medium/high), and mitigation.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.5,
      max_tokens: 2000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed10 = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'assessArchitectureRisks' });
    const archRisks = Array.isArray(parsed10) ? parsed10 : ((parsed10 as Record<string, unknown>).risks ?? []);
    const validated10 = ArchitectureRiskArraySchema.safeParse(archRisks);
    return (validated10.success ? validated10.data : archRisks) as ArchitectureBlueprint['risks'];
  }

  async identifyCheckpoints(plan: PlannerOutput, milestones: Array<unknown>): Promise<HumanCheckpoint[]> {
    this.prompts.setComponentContent('agent_role', 'You are a human checkpoint planning specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Identify human checkpoints for the project. Return a JSON array of HumanCheckpoint objects with id, phase, question, options, required (boolean), and description.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Plan:\n${JSON.stringify(plan, null, 2)}\n\nMilestones:\n${JSON.stringify(milestones, null, 2)}`;
    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 2000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed11 = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'identifyCheckpoints' });
    const checkpoints = Array.isArray(parsed11) ? parsed11 : ((parsed11 as Record<string, unknown>).checkpoints ?? []);
    const validated11 = HumanCheckpointArraySchema.safeParse(checkpoints);
    return (validated11.success ? validated11.data : checkpoints) as HumanCheckpoint[];
  }
}
