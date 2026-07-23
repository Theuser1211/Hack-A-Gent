import type { CompetitionAnalysis, WinningStrategy } from './types.js';

/**
 * Generates a winning strategy based on parsed competition data.
 * Recommendations are context-aware: time pressure, sponsor requirements, and judging criteria
 * determine the architecture, not a hardcoded default.
 *
 * NOTE: estimatedJudgeScore is a heuristic derived from judging criteria weights.
 * It represents an upper-bound estimate, not a measured or predicted score.
 */
export class WinningStrategyGenerator {
  generate(analysis: CompetitionAnalysis): WinningStrategy {
    const criteria = analysis.judgingCriteria;
    const topCriteria = [...criteria].sort((a, b) => b.weight - a.weight).slice(0, 3);
    const mustAPIs = analysis.sponsorAPIs.filter(a => a.strategicValue === 'must_use');
    const shouldAPIs = analysis.sponsorAPIs.filter(a => a.strategicValue === 'should_use');
    const allAPIs = [...mustAPIs, ...shouldAPIs];

    // Choose architecture based on parsed data, not hardcoded defaults
    const architecture = this.selectArchitecture(analysis);
    const stack = this.selectStack(analysis);

    return {
      projectName: analysis.challenge.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
      oneLiner: `${analysis.challenge.title} — ${analysis.challenge.theme} solution targeting ${topCriteria.map(c => c.name).join(', ')}`,
      whyScoreWell: [
        `Directly addresses top criteria: ${topCriteria.map(c => `${c.name} (${c.weight}%)`).join(', ')}`,
        'Live, deployed demo that judges can access immediately without setup',
        allAPIs.length > 0
          ? `Integrates ${allAPIs.map(a => a.name).join(', ')} for sponsor eligibility`
          : 'Clean, focused implementation that demonstrates core functionality',
      ],
      targetedCriteria: topCriteria.map(c => ({
        name: c.name,
        weight: c.weight,
        approach: `Lead the demo with ${c.name}. Dedicate the first 30 seconds to showing how the project addresses this criterion.`,
      })),
      prioritizedAPIs: [...mustAPIs.map(a => a.name), ...shouldAPIs.map(a => a.name)],
      architecture,
      differentiators: [
        'Live demo URL — judges do not need to install or configure anything',
        'Direct alignment with top-weighted judging criteria',
        allAPIs.length > 0 ? `Sponsor API integration: ${allAPIs.map(a => a.name).join(', ')}` : 'Clean, focused implementation',
      ],
      risks: [
        { risk: 'Building more features than time allows', mitigation: 'Implement one feature end-to-end before starting the next' },
        { risk: 'Deployment fails at the last minute', mitigation: 'Deploy a skeleton in the first 15 minutes, then iterate' },
        ...(mustAPIs.length > 0
          ? [{ risk: `${mustAPIs[0]!.name} API integration fails`, mitigation: 'Integrate and verify in the first 30 minutes; prepare a fallback demo' }]
          : []),
      ],
      recommendedStack: stack,
      // Heuristic estimate: upper-bound based on criteria weights. Not a real score.
      estimatedJudgeScore: Math.min(90, Math.round(criteria.reduce((s, c) => s + c.weight * 0.75, 0))),
    };
  }

  private selectArchitecture(analysis: CompetitionAnalysis): string {
    const mustAPIs = analysis.sponsorAPIs.filter(a => a.strategicValue === 'must_use');
    const apiNames = mustAPIs.map(a => a.name.toLowerCase()).join(' ');

    // Sponsor-driven architecture choices
    if (apiNames.includes('firebase')) return 'Static frontend + Firebase: direct SDK integration, no backend server needed';
    if (apiNames.includes('twilio')) return 'Node.js + Express: SMS/voice API integration, lightweight backend';
    if (apiNames.includes('stripe')) return 'Next.js + Stripe: built-in payment flow, serverless deployment';
    if (apiNames.includes('openai') || apiNames.includes('gemini')) return 'Python/FastAPI or Next.js + AI SDK: quick AI prototype, single deploy target';
    if (apiNames.includes('supabase')) return 'SvelteKit or Next.js + Supabase: real-time capable, managed backend';

    // Theme-driven architecture
    const theme = analysis.challenge.theme.toLowerCase();
    if (theme.includes('ai') || theme.includes('ml') || theme.includes('llm')) {
      return 'Python + FastAPI or Next.js + Vercel AI SDK: rapid AI prototyping, minimal setup';
    }
    if (theme.includes('mobile')) return 'React Native or PWA: single codebase for web + mobile';
    if (theme.includes('data') || theme.includes('dashboard')) return 'Next.js + Chart.js + SQLite: single-repo data viz, no external DB needed';

    // Default: simple full-stack
    return 'Next.js + SQLite (via better-sqlite3): single-repo full-stack, zero-config deploy to Vercel';
  }

  private selectStack(analysis: CompetitionAnalysis): string[] {
    const mustAPIs = analysis.sponsorAPIs.filter(a => a.strategicValue === 'must_use');
    const theme = analysis.challenge.theme.toLowerCase();

    const stack: string[] = [];

    // Choose framework based on sponsor APIs and theme
    if (mustAPIs.some(a => a.name.toLowerCase().includes('firebase'))) {
      stack.push('Vanilla JS', 'Firebase', 'Firebase Hosting');
    } else if (mustAPIs.some(a => /openai|gemini|hugging/i.test(a.name))) {
      stack.push('Next.js', 'Vercel AI SDK', 'Vercel');
    } else if (theme.includes('mobile') || theme.includes('pwa')) {
      stack.push('React', 'Vite', 'Netlify');
    } else if (theme.includes('data') || theme.includes('dashboard') || theme.includes('analytics')) {
      stack.push('Next.js', 'Chart.js', 'SQLite', 'Vercel');
    } else {
      stack.push('Next.js', 'TypeScript', 'Tailwind CSS', 'Vercel');
    }

    return stack;
  }
}
