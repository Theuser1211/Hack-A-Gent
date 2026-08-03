/**
 * Hack-A-Gent — Next-Generation Modular Prompt Component Renderers
 *
 * Each function renders a single, self-contained section of the prompt.
 * Components are composable and testable in isolation.
 *
 * Pipeline order:
 *   System → Hackathon Summary → Strategy → Project Vision →
 *   Architecture → Database Plan → API Plan → Frontend Plan → Backend Plan →
 *   Judging Alignment → Design Language → Feature Spec → Constraints →
 *   Output Schema → Generation
 */

import type {
  PromptSection,
  HackathonSummaryContext,
  StrategyPlanningContext,
  ProjectVisionContext,
  ArchitectureDesignContext,
  PlanDatabaseContext,
  PlanAPIContext,
  PlanFrontendContext,
  PlanBackendContext,
  JudgingAlignmentContext,
  DesignLanguageContext,
  FeatureSpecContext,
  ConstraintsContext,
  OutputSchemaContext,
} from './types.js';
import type { CompetitionAnalysis, WinningStrategy } from '../pipeline/types.js';
import type { CodeGenContext } from '../pipeline/strategy-adapter.js';
import type { InterviewResult } from '../interview/types.js';
import type { SponsorAPI, PromptComponent } from './types.js';

// ── Meta System (injected into every prompt) ───────────────────────────────

export function renderMetaSystem(): string {
  return `You are one agent in a deterministic, multi-agent software engineering
system called Hack-A-Gent. You produce work that downstream agents consume,
so consistency and verifiability matter more than prose.

Operating principles:
1. Plan before producing. Follow the reasoning steps in order.
2. Ground every claim in the data you are given. Do not invent facts.
3. Output ONLY the requested structure. No preamble, no trailing commentary.
4. Be concrete and actionable. Vague advice is a failure.`;
}

// ── Stage 1: Hackathon Summary ─────────────────────────────────────────────

export function renderHackathonSummary(context: HackathonSummaryContext): PromptSection {
  const { analysis } = context;
  const criteriaLines = analysis.judgingCriteria
    .map((c) => `- ${c.name} (${c.weight}%): ${c.description}`)
    .join('\n');

  const sponsorLines = analysis.sponsorAPIs
    .map((a) => `- ${a.name} (${a.strategicValue}): ${a.description}`)
    .join('\n');

  const restrictionLines = analysis.restrictions.length
    ? `\n\n**Restrictions:**\n${analysis.restrictions.map((r) => `- ${r}`).join('\n')}`
    : '';

  const deadlineLines = analysis.deadlines.length
    ? `\n\n**Deadlines:**\n${analysis.deadlines.map((d) => `- ${d.label}: ${d.date}`).join('\n')}`
    : '';

  const deliverableLines = analysis.deliverables.length
    ? `\n\n**Deliverables:**\n${analysis.deliverables.map((d) => `- ${d.description} (${d.format})${d.required ? ' [required]' : ''}`).join('\n')}`
    : '';

  const confidenceNote = context.extractionConfidence
    ? renderConfidenceNote(context.extractionConfidence)
    : '';

  return {
    title: 'Hackathon Summary',
    body: `# Hackathon: ${analysis.challenge.title}

**Theme:** ${analysis.challenge.theme}
**Difficulty:** ${analysis.challenge.difficulty}
**Organizer:** ${analysis.challenge.organizer}
**Participants:** ~${analysis.challenge.estimatedParticipants}

## Problem Statement
${analysis.challenge.problemStatement}

## Judging Criteria
${criteriaLines || '- No explicit judging criteria found'}
${sponsorLines ? `\n## Sponsor APIs\n${sponsorLines}` : ''}
${restrictionLines}
${deadlineLines}
${deliverableLines}
${confidenceNote}`,
  };
}

function renderConfidenceNote(
  confidence: NonNullable<CompetitionAnalysis['extractionConfidence']>,
): string {
  const unknowns = [
    confidence.judgingCriteria.confidence === 'unknown' ? 'judging criteria' : '',
    confidence.sponsorAPIs.confidence === 'unknown' ? 'sponsor APIs' : '',
    confidence.deadlines.confidence === 'unknown' ? 'deadlines' : '',
    confidence.restrictions.confidence === 'unknown' ? 'restrictions' : '',
  ].filter(Boolean);

  if (unknowns.length === 0) return '';
  return `\n\n> **Note:** Could not extract: ${unknowns.join(', ')}. These fields are not confirmed.`;
}

// ── Stage 2: Strategy Planning ───────────────────────────────────────────────

export function renderStrategyPlanning(context: StrategyPlanningContext): PromptSection {
  const { analysis, interviewResult, winningStrategy } = context;

  const topCriteria = [...analysis.judgingCriteria]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((c) => `- ${c.name} (${c.weight}%): ${c.description}`)
    .join('\n');

  const interviewSection = interviewResult
    ? `\n\n## Interview Insights\n` +
      (interviewResult.selectedSponsorApis.length
        ? `Selected sponsor APIs: ${interviewResult.selectedSponsorApis.join(', ')}\n`
        : '') +
      (interviewResult.optimizationBudget
        ? `Optimization budget: ${interviewResult.optimizationBudget}\n`
        : '') +
      (interviewResult.userProjectIdea
        ? `User idea: ${interviewResult.userProjectIdea}\n`
        : '') +
      (interviewResult.autoGeneratedIdea
        ? `Auto-generated idea: ${interviewResult.autoGeneratedIdea}\n`
        : '')
    : '';

  const recommended = winningStrategy
    ? `\n\n## Recommended Strategy\n` +
      `**Project Name:** ${winningStrategy.projectName}\n` +
      `**One-liner:** ${winningStrategy.oneLiner}\n` +
      `**Why it scores well:**\n${winningStrategy.whyScoreWell.map((s) => `- ${s}`).join('\n')}\n` +
      `**Differentiators:**\n${winningStrategy.differentiators.map((d) => `- ${d}`).join('\n')}\n` +
      `**Risks:**\n${winningStrategy.risks.map((r) => `- ${r.risk}: ${r.mitigation}`).join('\n')}`
    : '';

  return {
    title: 'Strategy Planning',
    body: `## Top Judging Criteria (sorted by weight)
${topCriteria || '- No criteria available'}
${interviewSection}
${recommended}`,
  };
}

// ── Stage 3: Project Vision ──────────────────────────────────────────────────

export function renderProjectVision(context: ProjectVisionContext): PromptSection {
  const { vision, interviewResult } = context;

  const interviewSection = interviewResult
    ? `\n\n## Interview Context\n` +
      (interviewResult.userProjectIdea
        ? `- User stated idea: ${interviewResult.userProjectIdea}\n`
        : '') +
      (interviewResult.autoGeneratedIdea
        ? `- Auto-generated idea: ${interviewResult.autoGeneratedIdea}\n`
        : '') +
      (interviewResult.selectedSponsorApis.length
        ? `- Selected sponsor APIs: ${interviewResult.selectedSponsorApis.join(', ')}\n`
        : '')
    : '';

  return {
    title: 'Project Vision',
    body: `# Project: ${vision.projectName}

## One-Liner
${vision.oneLiner}

## Problem Solved
${vision.problemSolved}

## Target Users
${vision.targetUsers.map((u) => `- ${u}`).join('\n')}

## Key Features
${vision.keyFeatures.map((f) => `- ${f}`).join('\n')}

## Tech Feasibility
${vision.techFeasibility}

## Demo Narrative
${vision.demoNarrative}
${interviewSection}`,
  };
}

// ── Stage 4: Architecture Design (Multi-Stage Thinking) ─────────────────────

export function renderArchitectureDesign(context: ArchitectureDesignContext): PromptSection {
  const { strategy, codeGenCtx, architectureArtifacts: artifacts } = context;

  const techLines = [
    `- Frontend: ${codeGenCtx.technologyStack.frontend}`,
    `- Backend: ${codeGenCtx.technologyStack.backend}`,
    `- Database: ${codeGenCtx.technologyStack.database}`,
    `- Deployment: ${codeGenCtx.technologyStack.deployment}`,
    `- Testing: ${codeGenCtx.technologyStack.testing}`,
    `- Styling: ${codeGenCtx.technologyStack.styling}`,
  ].join('\n');

  const componentGraphBody = renderComponentGraph(artifacts.componentGraph);
  const apiGraphBody = renderAPIGraph(artifacts.apiGraph);
  const dbSchemaBody = renderDatabaseSchema(artifacts.databaseSchema);
  const folderStructure = artifacts.folderStructure;
  const userFlowsBody = renderUserFlows(artifacts.userFlows);

  return {
    title: 'Architecture Design',
    body: `## Architecture: ${strategy.architecture}

## Technology Stack
${techLines}

## Component Graph
${componentGraphBody}

## API Graph
${apiGraphBody}

## Database Schema
${dbSchemaBody}

## Folder Structure
\`\`\`
${folderStructure}
\`\`\`

## User Flows
${userFlowsBody}`,
  };
}

function renderComponentGraph(graph: ArchitectureDesignContext['architectureArtifacts']['componentGraph']): string {
  const nodes = graph.nodes
    .map((n) => `- ${n.name} [${n.type}]: ${n.description}${n.imports.length ? `\n  imports: ${n.imports.join(', ')}` : ''}`)
    .join('\n');

  const edges = graph.edges
    .map((e) => `- ${e.from} → ${e.to} (${e.type})`)
    .join('\n');

  return `**Nodes:**\n${nodes}\n\n**Edges:**\n${edges || '- none'}`;
}

function renderAPIGraph(graph: ArchitectureDesignContext['architectureArtifacts']['apiGraph']): string {
  const baseUrl = graph.baseUrl;
  const endpoints = graph.endpoints
    .map((e) => `- ${e.method} ${e.path}: ${e.purpose}\n  params: ${e.requestParams.join(', ')}\n  response: ${e.responseShape}`)
    .join('\n');

  return `**Base URL:** ${baseUrl}\n\n**Endpoints:**\n${endpoints || '- none'}`;
}

function renderDatabaseSchema(schema: ArchitectureDesignContext['architectureArtifacts']['databaseSchema']): string {
  const tables = schema.tables
    .map((t) => {
      const cols = t.columns.map((c) => `${c.name}: ${c.type}${c.key ? ' (PK)' : ''}${c.relation ? ` → ${c.relation}` : ''}`).join(', ');
      const indexes = t.indexes.length ? `\n  indexes: ${t.indexes.join(', ')}` : '';
      return `- ${t.name}: ${t.purpose}\n  columns: ${cols}${indexes}`;
    })
    .join('\n');

  return `**Tables:**\n${tables}\n\n**Seed data:** ${schema.seedData ? 'yes' : 'no'}`;
}

function renderUserFlows(flows: ArchitectureDesignContext['architectureArtifacts']['userFlows']): string {
  return flows
    .map((flow) => `### ${flow.name}\n${flow.steps.map((s, i) => `${i + 1}. ${s.name} — ${s.description} (components: ${s.components.join(', ')})`).join('\n')}`)
    .join('\n\n');
}

// ── Stage 5: Database Plan ───────────────────────────────────────────────────

export function renderPlanDatabase(context: PlanDatabaseContext): PromptSection {
  const { dbSchema } = context;

  const tables = dbSchema.tables
    .map((t) => {
      const cols = t.columns
        .map((c) => {
          const parts = [c.name, c.type];
          if (c.key) parts.push('PRIMARY KEY');
          if (c.relation) parts.push(`FK → ${c.relation}`);
          return parts.join(' ');
        })
        .join('\n  ');
      return `**${t.name}** — ${t.purpose}
  ${cols}
  indexes: ${t.indexes.join(', ')}`;
    })
    .join('\n\n');

  return {
    title: 'Database Plan',
    body: `## Database Schema

${tables}

## Seed Data
${dbSchema.seedData ? 'Include realistic seed data for development and demo purposes.' : 'No seed data required.'}`,
  };
}

// ── Stage 6: API Plan ────────────────────────────────────────────────────────

export function renderPlanAPI(context: PlanAPIContext): PromptSection {
  const { apiGraph, dbSchema } = context;

  const endpoints = apiGraph.endpoints
    .map((e) => `### ${e.method} ${e.path}
- **Purpose:** ${e.purpose}
- **Request params:** ${e.requestParams.join(', ')}
- **Response shape:** ${e.responseShape}
- **DB tables used:** ${dbSchema.tables.map((t) => t.name).join(', ')}`)
    .join('\n\n');

  return {
    title: 'API Plan',
    body: `## API Design

**Base URL:** ${apiGraph.baseUrl}

${endpoints || '- No endpoints defined'}`,
  };
}

// ── Stage 7: Frontend Plan ───────────────────────────────────────────────────

export function renderPlanFrontend(context: PlanFrontendContext): PromptSection {
  const { uiDirection, componentGraph } = context;

  const nodes = componentGraph.nodes
    .filter((n) => n.type === 'page' || n.type === 'component' || n.type === 'layout')
    .map((n) => `- ${n.name} [${n.type}]: ${n.description}`)
    .join('\n');

  const edges = componentGraph.edges
    .filter((e) => e.type === 'import' || e.type === 'composes')
    .map((e) => `- ${e.from} → ${e.to}`)
    .join('\n');

  return {
    title: 'Frontend Plan',
    body: `## Design Language: ${uiDirection.designLanguage}
## Layout: ${uiDirection.layout}
## Component Library: ${uiDirection.componentLibrary}

## Key Screens
${uiDirection.keyScreens.map((s) => `- ${s}`).join('\n')}

## Components
${nodes || '- none defined'}

## Component Relationships
${edges || '- none'}

## Responsive Breakpoints
${uiDirection.responsiveBreakpoints}`,
  };
}

// ── Stage 8: Backend Plan ────────────────────────────────────────────────────

export function renderPlanBackend(context: PlanBackendContext): PromptSection {
  const { apiGraph, dbSchema } = context;

  const tableNames = dbSchema.tables.map((t) => t.name);
  const endpoints = apiGraph.endpoints
    .map((e) => `- ${e.method} ${e.path}: ${e.purpose} (params: ${e.requestParams.join(', ')})`)
    .join('\n');

  return {
    title: 'Backend Plan',
    body: `## API Endpoints
${endpoints || '- none defined'}

## Database Tables
${tableNames.map((t) => `- ${t}`).join('\n')}

## External Integrations
${apiGraph.baseUrl}`,
  };
}

// ── Stage 9: Judging Alignment ───────────────────────────────────────────────

export function renderJudgingAlignment(context: JudgingAlignmentContext): PromptSection {
  const { analysis, strategy } = context;

  const criteriaLines = analysis.judgingCriteria
    .sort((a, b) => b.weight - a.weight)
    .map((c) => {
      const approach = strategy.targetedCriteria.find((tc) => tc.name === c.name);
      return `- **${c.name} (${c.weight}%)** [${c.priority}]: ${c.description}\n  Approach: ${approach?.approach ?? 'Align demo with this criterion'}`;
    })
    .join('\n');

  const apiLines = strategy.prioritizedAPIs.length
    ? `\n\n## Sponsor API Integration Priority\n` +
      strategy.prioritizedAPIs
        .map((api) => {
          const sponsor = analysis.sponsorAPIs.find((s) => s.name === api);
          const value = sponsor?.strategicValue ?? 'should_use';
          return `- ${api} [${value}]: ${sponsor?.description ?? 'Integration required'}`;
        })
        .join('\n')
    : '';

  return {
    title: 'Judging Alignment',
    body: `## Judging Criteria (sorted by weight)
${criteriaLines}
${apiLines}`,
  };
}

// ── Stage 10: Design Language ─────────────────────────────────────────────────

export function renderDesignLanguage(context: DesignLanguageContext): PromptSection {
  const { uiDirection, theme, sponsorApis } = context;

  const themePalette = getThemePalette(theme);
  const sponsorSection = sponsorApis && sponsorApis.length
    ? `\n## Sponsor API Design Integration\n` +
      sponsorApis.map((api) => `- ${api.name}: integrate into UI design for ${api.strategicValue} impact`).join('\n')
    : '';

  return {
    title: 'Design Language',
    body: `## Design Language: ${uiDirection.designLanguage}

## Layout: ${uiDirection.layout}

## Component Library: ${uiDirection.componentLibrary}

## Color Palette
${themePalette}

## Key Screens
${uiDirection.keyScreens.map((s) => `- ${s}`).join('\n')}

## Responsive Breakpoints
${uiDirection.responsiveBreakpoints}
${sponsorSection}`,
  };
}

function getThemePalette(theme: string): string {
  const themeLower = theme.toLowerCase();
  switch (true) {
    case themeLower.includes('ai') || themeLower.includes('ml'):
      return '- AI/ML: Deep purples (#7c3aed) + electric blue (#3b82f6) on dark (#0f172a)\n- Use data visualizations, gradient accents, dark theme';
    case themeLower.includes('health') || themeLower.includes('wellness'):
      return '- Healthcare: Calming teal (#0d9488) + soft white (#f8fafc) on light\n- Clean typography, medical iconography';
    case themeLower.includes('fintech') || themeLower.includes('finance'):
      return '- Fintech: Professional slate (#334155) + gold accent (#eab308) on dark\n- Charts, numerical displays, trust signals';
    case themeLower.includes('climate') || themeLower.includes('green') || themeLower.includes('sustainability'):
      return '- Climate/Green: Forest green (#16a34a) + earth brown (#92400e) on cream\n- Nature imagery, sustainability metrics';
    case themeLower.includes('game'):
      return '- Gaming: Hot pink (#ec4899) + cyan (#06b6d4) on dark\n- Bold colors, animations, playful typography';
    case themeLower.includes('dev') || themeLower.includes('tools'):
      return '- Developer tools: Monochrome (#1e293b) + terminal green (#22c55e) on black\n- Monospace fonts, terminal aesthetics';
    case themeLower.includes('social') || themeLower.includes('community'):
      return '- Social/Community: Warm orange (#f97316) + coral (#f43f5e) on white\n- Avatars, activity feeds, engagement metrics';
    default:
      return '- Modern, clean with generous whitespace and subtle shadows\n- Consistent color scheme throughout the project';
  }
}

// ── Stage 11: Feature Spec ──────────────────────────────────────────────────

export function renderFeatureSpec(context: FeatureSpecContext): PromptSection {
  const { strategy, codeGenCtx, fileType, specificTask } = context;

  const apiSection = codeGenCtx.sponsorApis.length
    ? `\n\n## Sponsor APIs (prioritized)\n` +
      codeGenCtx.sponsorApis.map((api) => `- ${api}`).join('\n')
    : '';

  const taskFocus = specificTask ? `\n\n## Focus\n${specificTask}` : '';
  const scaffoldFiles = fileType === 'scaffold'
    ? `\n\n## Required Scaffold Files\npackage.json, tsconfig.json, next.config.js, .gitignore, .env.example, src/config.ts, .eslintrc.json, tailwind.config.js, postcss.config.js, src/app/globals.css, src/app/layout.tsx, src/app/page.tsx, src/app/loading.tsx, src/app/error.tsx, README.md`
    : '';

  const ts = codeGenCtx.technologyStack;

  return {
    title: 'Feature Specification',
    body: `## Task Type: ${fileType}

## Project: ${strategy.projectName}
## One-liner: ${strategy.oneLiner}

## Technology Stack
- Frontend: ${ts.frontend}
- Backend: ${ts.backend}
- Database: ${ts.database}
- Deployment: ${ts.deployment}
- Testing: ${ts.testing}
- Styling: ${ts.styling}
${apiSection}${taskFocus}${scaffoldFiles}`,
  };
}

// ── Stage 12: Constraints ─────────────────────────────────────────────────────

export function renderConstraints(context: ConstraintsContext): PromptSection {
  const { analysis, strategy, interviewResult, restrictions } = context;

  const effectiveRestrictions = restrictions?.length ? restrictions : analysis.restrictions;

  const restrictionLines = effectiveRestrictions.length
    ? effectiveRestrictions.map((r) => `- ${r}`).join('\n')
    : '- None specified';

  const constraintLines = [
    '- Export default for components. Define types inline.',
    '- Import with @/ alias. Generate every imported file. No dangling imports.',
    '- Use Tailwind CSS utility classes. Use className not class.',
    '- Use realistic mock data, not placeholder text or "lorem ipsum".',
    '- Each page must map to a judging criterion.',
    interviewResult && interviewResult.selectedSponsorApis.length
      ? `- Must use sponsor APIs: ${interviewResult.selectedSponsorApis.join(', ')}`
      : '',
  ].filter(Boolean).join('\n');

  const budgetNote = interviewResult?.optimizationBudget
    ? `\n**Budget:** ${interviewResult.optimizationBudget}`
    : '';

  return {
    title: 'Constraints & Rules',
    body: `## Restrictions
${restrictionLines}

## Coding Rules
${constraintLines}
${budgetNote}`,
  };
}

// ── Stage 13: Output Schema ───────────────────────────────────────────────────

export function renderOutputSchema(context: OutputSchemaContext): PromptSection {
  const { fileType, specificTask, requiredTechs } = context;

  const requiredSection = requiredTechs && requiredTechs.length
    ? `\n\n## Required Technologies\n` +
      requiredTechs
        .map(
          (t) =>
            `- ${t}: Include in package.json dependencies AND use in actual code (imports, configuration, API calls)`,
        )
        .join('\n')
    : '';

  let taskDescription = '';
  switch (fileType) {
    case 'scaffold':
      taskDescription = 'Generate the full hackathon project. The page MUST demonstrate the core value proposition immediately — no "Welcome" or "Get Started" headers. Show the actual product in action. Use domain-appropriate design. Include realistic mock data. Add interactive elements. Map each section to a judging criterion.';
      break;
    case 'frontend':
      taskDescription = `Generate frontend code for: ${specificTask ?? 'core feature'}. ONE file per component. Use Tailwind CSS classes. Component must have typed props, handle loading/error/empty states, use realistic mock data, and include interactive elements.`;
      break;
    case 'backend':
      taskDescription = `Generate API route for: ${specificTask ?? 'core functionality'}. ONE file per route. Validate input at boundary, return structured JSON responses, handle errors gracefully, include realistic mock data or database queries.`;
      break;
    case 'database':
      taskDescription = `Generate database schema for: ${specificTask ?? 'core data model'}. Define tables with explicit types, primary keys, and foreign keys. Add indexes for common query patterns. Include seed data.`;
      break;
    case 'config':
      taskDescription = 'Generate one config file for the project.';
      break;
  }

  return {
    title: 'Output Schema',
    body: `## Task: ${taskDescription}
${requiredSection}`,
  };
}

// ── Full Generation Prompt Assembly ────────────────────────────────────────

export interface GenerationPromptContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
  codeGenCtx: CodeGenContext;
  fileType: OutputSchemaContext['fileType'];
  specificTask?: string;
  seed: number;
  interviewResult?: InterviewResult;
  architectureArtifacts?: ArchitectureDesignContext['architectureArtifacts'];
}

export function renderGenerationPrompt(context: GenerationPromptContext): PromptComponent {
  const hackathonSummary = renderHackathonSummary({
    analysis: context.analysis,
    extractionConfidence: context.analysis.extractionConfidence ?? null,
  });

  const judgingAlign = renderJudgingAlignment({
    analysis: context.analysis,
    strategy: context.strategy,
    targetedCriteria: context.strategy.targetedCriteria,
    prioritizedAPIs: context.strategy.prioritizedAPIs,
  });

  const designLang = renderDesignLanguage({
    analysis: context.analysis,
    uiDirection: context.strategy.uiDirection ?? context.codeGenCtx.uiScaffold,
    theme: context.analysis.challenge.theme,
    sponsorApis: context.analysis.sponsorAPIs,
  });

  const featureSpec = renderFeatureSpec({
    analysis: context.analysis,
    strategy: context.strategy,
    codeGenCtx: context.codeGenCtx,
    fileType: context.fileType,
    specificTask: context.specificTask,
  });

  const constraints = renderConstraints({
    analysis: context.analysis,
    strategy: context.strategy,
    interviewResult: context.interviewResult,
    restrictions: context.analysis.restrictions,
  });

  const outputSchema = renderOutputSchema({
    fileType: context.fileType,
    specificTask: context.specificTask,
    requiredTechs: context.codeGenCtx.sponsorApis,
  });

  const sections: PromptSection[] = [
    { title: 'Meta', body: renderMetaSystem(), optional: false },
    hackathonSummary,
    judgingAlign,
    designLang,
    featureSpec,
    constraints,
    outputSchema,
  ];

  const systemPrompt = sections.map((s) => `## ${s.title}\n\n${s.body}`).join('\n\n---\n\n');

  return {
    id: 'generation',
    priority: 0,
    maxTokens: 16384,
    required: true,
    content: systemPrompt,
  };
}
