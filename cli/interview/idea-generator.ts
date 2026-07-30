import type { CompetitionAnalysis } from '../pipeline/types.js';
import type { InterviewResult } from './types.js';

export function generateProjectIdea(analysis: CompetitionAnalysis, result: InterviewResult): string {
  const topCriterion = analysis.judgingCriteria
    .slice()
    .sort((a, b) => b.weight - a.weight)[0];

  const focusArea = topCriterion?.name ?? 'innovation';

  const apiName = result.selectedSponsorApis.length > 0
    ? result.selectedSponsorApis[0]!
    : analysis.sponsorAPIs.length > 0
      ? analysis.sponsorAPIs
          .slice()
          .sort((a, b) => priorityRank(a.strategicValue) - priorityRank(b.strategicValue))[0]!.name
      : null;

  const theme = analysis.challenge.theme;

  return buildIdea(focusArea, apiName, theme);
}

function buildIdea(focusArea: string, apiName: string | null, theme: string): string {
  const lcFocus = focusArea.toLowerCase();
  const lcTheme = theme.toLowerCase();

  if (apiName) {
    if (lcFocus.includes('innovation') || lcFocus.includes('creativity')) {
      return `A ${lcTheme}-powered platform using ${apiName} that reimagines how users solve ${lcTheme} challenges through an innovative, AI-driven approach.`;
    }
    if (lcFocus.includes('technical') || lcFocus.includes('complexity') || lcFocus.includes('depth')) {
      return `A technically sophisticated ${lcTheme} application built with ${apiName}, featuring real-time data processing, intelligent automation, and a scalable cloud architecture.`;
    }
    if (lcFocus.includes('impact') || lcFocus.includes('social')) {
      return `An impactful ${lcTheme} solution leveraging ${apiName} to deliver measurable real-world outcomes, with a focus on accessibility and broad user adoption.`;
    }
    if (lcFocus.includes('design') || lcFocus.includes('ux') || lcFocus.includes('usability')) {
      return `A beautifully designed ${lcTheme} experience powered by ${apiName}, with intuitive interfaces, seamless interactions, and polished user flows.`;
    }
    if (lcFocus.includes('complete') || lcFocus.includes('functionality')) {
      return `A fully-featured ${lcTheme} platform built on ${apiName}, delivering complete end-to-end functionality with robust error handling and production-ready quality.`;
    }
    return `A ${lcTheme} application using ${apiName} that excels in ${lcFocus}, combining modern architecture with a focus on user value.`;
  }

  if (lcFocus.includes('innovation') || lcFocus.includes('creativity')) {
    return `A novel ${lcTheme} platform that pushes creative boundaries, delivering an unexpected and delightful user experience through cutting-edge technology.`;
  }
  if (lcFocus.includes('technical') || lcFocus.includes('complexity') || lcFocus.includes('depth')) {
    return `A technically deep ${lcTheme} application showcasing advanced engineering, real-time capabilities, and a robust, scalable backend architecture.`;
  }
  if (lcFocus.includes('impact') || lcFocus.includes('social')) {
    return `A purpose-driven ${lcTheme} solution designed for maximum real-world impact, addressing a pressing problem with a practical, user-centered approach.`;
  }
  return `A ${lcTheme} application focused on ${lcFocus}, built with modern best practices and designed to impress judges.`;
}

function priorityRank(p: string): number {
  if (p === 'must_use') return 0;
  if (p === 'should_use') return 1;
  return 2;
}
