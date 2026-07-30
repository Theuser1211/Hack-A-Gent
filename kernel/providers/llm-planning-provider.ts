import type { ContextEngine } from '../context/context-engine.js';
import type { LLMRequest } from '../llm/llm-types.js';
import type { RouterEngine } from '../llm/router-engine.js';
import type {
  HackathonInput,
  HackathonData,
  ProjectIdea,
  Unknown,
  RecommendedQuestion,
  Risk,
} from '../planning/planner-types.js';
import type { PlanningProvider } from '../planning/planning-provider.js';
import type { PromptEngine } from '../prompts/prompt-engine.js';
import { extractJSON, executeWithJSONRetry, buildRetryPrompt } from './json-extractor.js';
import { HackathonDataSchema, ProjectIdeaArraySchema, RiskArraySchema, UnknownArraySchema, RecommendedQuestionArraySchema } from './llm-output-schemas.js';

export class LLMPlanningProvider implements PlanningProvider {
  private router: RouterEngine;
  private prompts: PromptEngine;
  private context: ContextEngine;
  private taskType: string = 'planning';

  constructor(router: RouterEngine, prompts: PromptEngine, context: ContextEngine) {
    this.router = router;
    this.prompts = prompts;
    this.context = context;
  }

  async ingestHackathon(input: HackathonInput): Promise<HackathonData> {
    this.prompts.setComponentContent('agent_role', 'You are a hackathon data extraction specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Extract structured hackathon data from the provided input. Return a JSON object with hackathon_name, theme, tracks, judging_criteria, sponsor_technologies, timeline, submission_requirements, and description.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON only. No markdown, no code fences, no explanation.',
    );

    const contextPackage = this.context.assemble('Extract hackathon data', {
      taskType: this.taskType,
      modelContextWindow: 8000,
    });
    const contextText = contextPackage.items.map((i) => i.content).join('\n');

    const userContent = [contextText, `Input: ${JSON.stringify(input)}`].filter(Boolean).join('\n\n');

    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.1,
      max_tokens: 2000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed = extractJSON(response.content, { schema: HackathonDataSchema, provider: response.provider, model: response.model_id, stage: 'ingestHackathon' });
    return parsed as HackathonData;
  }

  async generateProjectIdeas(data: HackathonData): Promise<ProjectIdea[]> {
    this.prompts.setComponentContent('agent_role', 'You are a creative hackathon project ideation specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Generate 3-5 innovative project ideas for the given hackathon. Return a JSON array of ProjectIdea objects with id, title, description, tracks, difficulty (1-10), innovation (1-10), estimated_build_time_hours, risks, key_features, required_skills, and sponsor_technology_used.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Hackathon Data:\n${JSON.stringify(data, null, 2)}`;

    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.8,
      max_tokens: 4000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'generateProjectIdeas' });
    const ideas = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown>).ideas ?? (parsed as Record<string, unknown>).projects ?? []);
    const validated = ProjectIdeaArraySchema.safeParse(ideas);
    return (validated.success ? validated.data : ideas) as ProjectIdea[];
  }

  async assessRisks(data: HackathonData, ideas: ProjectIdea[]): Promise<Risk[]> {
    this.prompts.setComponentContent('agent_role', 'You are a hackathon risk assessment specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Assess risks for the given hackathon and project ideas. Return a JSON array of Risk objects with category (technical/time/scope/team/sponsor/external), description, severity (low/medium/high), and optional mitigation.',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Hackathon Data:\n${JSON.stringify(data, null, 2)}\n\nProject Ideas:\n${JSON.stringify(ideas, null, 2)}`;

    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.5,
      max_tokens: 2000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'assessRisks' });
    const risks = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown>).risks ?? []);
    const validated = RiskArraySchema.safeParse(risks);
    return (validated.success ? validated.data : risks) as Risk[];
  }

  async identifyUnknowns(data: HackathonData, ideas: ProjectIdea[]): Promise<Unknown[]> {
    this.prompts.setComponentContent('agent_role', 'You are a hackathon gap analysis specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Identify unknown factors and missing information for the given hackathon and project ideas. Return a JSON array of Unknown objects with category, question, and impact (low/medium/high).',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Hackathon Data:\n${JSON.stringify(data, null, 2)}\n\nProject Ideas:\n${JSON.stringify(ideas, null, 2)}`;

    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.5,
      max_tokens: 2000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'identifyUnknowns' });
    const unknowns = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown>).unknowns ?? []);
    const validated = UnknownArraySchema.safeParse(unknowns);
    return (validated.success ? validated.data : unknowns) as Unknown[];
  }

  async generateQuestions(unknowns: Unknown[]): Promise<RecommendedQuestion[]> {
    this.prompts.setComponentContent('agent_role', 'You are a hackathon question generation specialist.');
    this.prompts.setComponentContent(
      'task_instructions',
      'Generate clarifying questions based on the identified unknowns. Return a JSON array of RecommendedQuestion objects with id, question, context, and priority (essential/recommended/nice_to_have).',
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON array only. No markdown, no code fences, no explanation.',
    );

    const userContent = `Unknowns:\n${JSON.stringify(unknowns, null, 2)}`;

    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.5,
      max_tokens: 2000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed = extractJSON(response.content, { provider: response.provider, model: response.model_id, stage: 'generateQuestions' });
    const questions = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown>).questions ?? []);
    const validated = RecommendedQuestionArraySchema.safeParse(questions);
    return (validated.success ? validated.data : questions) as RecommendedQuestion[];
  }
}
