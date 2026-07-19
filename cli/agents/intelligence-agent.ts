/**
 * CompetitionIntelligenceAgent — Production migration of the Competition
 * Intelligence component onto the PipelineAgent interface (Part 1, M1).
 *
 * It wraps the existing production `CompetitionIntelligence` engine so its
 * analysis output is unchanged, but it now also:
 *   - makes autonomous engineering DECISIONS (Part 2) with reasoning,
 *     alternatives, confidence, expected impact, and tradeoffs;
 *   - records what it learned into Organizational Memory (Part 4).
 *
 * The actual analysis is delegated to the same engine used by the legacy
 * pipeline, so pipeline behaviour is identical. The agent adds durable
 * side-effects (decisions + memory) without altering the project output.
 */

import { CompetitionIntelligence, type CompetitionAnalysis, type DevpostParseResult } from '../pipeline/index.js';
import { BaseAgent } from './base-agent.js';
import type { AgentContext, AgentResult } from './types.js';
import { DecisionStore, type DecisionCategory } from '../decisions.js';
import { OrganizationalMemory } from '../learning/organizational-memory.js';

export interface CompetitionIntelligenceAgentOutput {
  analysis: CompetitionAnalysis;
  brief: string;
  decisionCount: number;
}

export class CompetitionIntelligenceAgent extends BaseAgent {
  readonly manifest = {
    id: 'agent.competition-intelligence',
    name: 'Competition Intelligence Agent',
    description: 'Analyzes a parsed Devpost spec and makes autonomous architecture/sponsor/deployment decisions.',
    accepts: ['analysis', 'planning', 'intelligence'],
  };

  private engine = new CompetitionIntelligence();

  override async plan(ctx: AgentContext): Promise<void> {
    const parsed = ctx.inputs.parsed as DevpostParseResult | undefined;
    if (!parsed) return;

    // Run the analysis in plan() so autonomous decisions can be derived from it.
    const analysis = this.engine.analyze(parsed);
    ctx.scratch.analysis = analysis;

    const decisions = ctx.inputs.decisionStore as DecisionStore | undefined;
    if (decisions) {
      this.decideStack(decisions, analysis, parsed);
      this.decideSponsorAPIs(decisions, analysis);
      this.decideDeployment(decisions, analysis, parsed);
    }
  }

  override async execute(ctx: AgentContext): Promise<AgentResult> {
    const parsed = ctx.inputs.parsed as DevpostParseResult | undefined;
    const analysis = ctx.scratch.analysis as CompetitionAnalysis | undefined;
    if (!parsed) {
      return { status: 'failed', output: null, summary: 'No parsed Devpost spec provided', artifacts: {} };
    }
    if (!analysis) {
      return { status: 'failed', output: null, summary: 'Analysis missing from plan stage', artifacts: {} };
    }

    const brief = this.engine.generateBrief(analysis);

    return {
      status: 'completed',
      output: { analysis, brief, decisionCount: 0 } satisfies CompetitionIntelligenceAgentOutput,
      summary: `Analyzed "${analysis.challenge.title}" — ${analysis.judgingCriteria.length} criteria, ${analysis.sponsorAPIs.length} sponsor APIs`,
      artifacts: { analysisId: analysis.analysisId, brief },
    };
  }

  override report(ctx: AgentContext, result: AgentResult): string {
    const out = result.output as CompetitionIntelligenceAgentOutput | null;
    const memory = ctx.inputs.memory as OrganizationalMemory | undefined;
    if (memory && out) {
      memory.recordArchitecture({
        projectName: out.analysis.challenge.title,
        stack: out.analysis.sponsorAPIs.length > 0
          ? out.analysis.sponsorAPIs.map((s) => s.name)
          : ['React', 'Node.js'],
        deployTarget: 'vercel',
        judgeScore: 0,
        success: true,
        notes: `Intelligence stage for "${out.analysis.challenge.title}"`,
      });
      memory.recordPrompt({
        purpose: 'competition-intelligence-brief',
        outcome: 'success',
        notes: out.brief.slice(0, 200),
      });
    }
    return result.summary;
  }

  // ── Autonomous decision helpers (Part 2) ────────────────────────────────

  private decideStack(decisions: DecisionStore, analysis: CompetitionAnalysis, parsed: DevpostParseResult): void {
    const recommended = analysis.sponsorAPIs.length > 0
      ? ['Next.js', 'TypeScript', 'Tailwind CSS', ...analysis.sponsorAPIs.map((s) => s.name)]
      : parsed.recommendedStack;
    decisions.record({
      category: 'tech_stack',
      question: 'Which tech stack should we use?',
      choice: recommended.join(', '),
      reasoning: `Aligned with ${analysis.judgingCriteria.length} judging criteria and ${analysis.sponsorAPIs.length} sponsor APIs; Next.js maximizes judge-aligned deployment and demo accessibility.`,
      alternatives: ['Vite + React', 'Express + vanilla', parsed.recommendedStack.join(', ') || 'template default'],
      confidence: 0.8,
      expectedImpact: 'Higher judge alignment and deployability',
      tradeoffs: 'Next.js has heavier boilerplate than Vite but better demo hosting.',
      agentId: this.manifest.id,
    });
  }

  private decideSponsorAPIs(decisions: DecisionStore, analysis: CompetitionAnalysis): void {
    const must = analysis.sponsorAPIs.filter((s) => s.strategicValue === 'must_use');
    const should = analysis.sponsorAPIs.filter((s) => s.strategicValue === 'should_use');
    if (must.length === 0 && should.length === 0) return;
    decisions.record({
      category: 'sponsor_api',
      question: 'Which sponsor APIs should we integrate?',
      choice: [...must, ...should].map((s) => s.name).join(', '),
      reasoning: `Must-use APIs are required by the competition rules; should-use APIs boost judge alignment.`,
      alternatives: ['Skip sponsor APIs', 'Only must-use'],
      confidence: must.length > 0 ? 0.9 : 0.6,
      expectedImpact: 'Directly addresses sponsor criteria — strong judge signal',
      tradeoffs: 'More integration effort and potential for API-key failures.',
      agentId: this.manifest.id,
    });
  }

  private decideDeployment(decisions: DecisionStore, analysis: CompetitionAnalysis, parsed: DevpostParseResult): void {
    const wantsDeploy = parsed.submissionRequirements.some((r) => /demo|live|deploy|url|website/i.test(r));
    decisions.record({
      category: 'deployment',
      question: 'Should we deploy a live demo?',
      choice: wantsDeploy ? 'Yes — deploy to Vercel' : 'Yes — deploy if build succeeds',
      reasoning: 'Judges must be able to interact with the project; a live URL is a near-universal requirement.',
      alternatives: ['No deployment', 'Netlify', 'Static export'],
      confidence: 0.85,
      expectedImpact: 'Required for most hackathon judging; unblocks judge interaction',
      tradeoffs: 'Deployment can fail near deadlines; mitigated by deploying early.',
      agentId: this.manifest.id,
    });
  }
}
