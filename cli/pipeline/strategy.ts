import type { CompetitionAnalysis, WinningStrategy } from './types.js';

export class WinningStrategyGenerator {
  generate(analysis: CompetitionAnalysis): WinningStrategy {
    const criteria = analysis.judgingCriteria;
    const topCriteria = [...criteria].sort((a, b) => b.weight - a.weight).slice(0, 3);
    const mustAPIs = analysis.sponsorAPIs.filter(a => a.strategicValue === 'must_use');
    const shouldAPIs = analysis.sponsorAPIs.filter(a => a.strategicValue === 'should_use');

    return {
      projectName: analysis.challenge.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
      oneLiner: analysis.challenge.title + ' - A judge-optimized solution for ' + analysis.challenge.theme,
      whyScoreWell: [
        'Directly targets highest-weighted criteria: ' + topCriteria.map(c => c.name).join(', '),
        'Polished, deployed demo that judges can interact with immediately',
        'Uses recommended technologies for compatibility and sponsor alignment',
      ],
      targetedCriteria: topCriteria.map(c => ({
        name: c.name,
        weight: c.weight,
        approach: 'Build dedicated features and demo elements that showcase ' + c.name,
      })),
      prioritizedAPIs: [...mustAPIs.map(a => a.name), ...shouldAPIs.map(a => a.name)],
      architecture: 'Next.js full-stack with serverless API routes, PostgreSQL, Vercel deployment',
      differentiators: [
        'Fully deployed and accessible live demo',
        'Polished UX with responsive design and animations',
        'Directly addresses each judging criterion explicitly',
      ],
      risks: [
        { risk: 'Scope creep beyond MVP', mitigation: 'Strictly prioritize top-weighted criteria' },
        { risk: 'Deployment failure close to deadline', mitigation: 'Deploy early, iterate continuously' },
      ],
      recommendedStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'PostgreSQL', 'Vercel'],
      estimatedJudgeScore: Math.min(95, Math.round(criteria.reduce((s, c) => s + c.weight * 0.8, 0))),
    };
  }
}
