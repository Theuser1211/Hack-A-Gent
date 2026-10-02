import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { JudgeResult, ImprovementAction, ImprovementActionType, ActionPriority } from './improvement-types.js';

interface DimensionRule {
  key: keyof JudgeResult['scores'];
  label: string;
  actionType: ImprovementActionType;
  buildTarget: (files: string[]) => string;
  buildDescription: (score: number, label: string) => string;
  buildImplementation: (score: number, label: string, files: string[]) => string;
}

function scanProjectFiles(projectDir: string): string[] {
  const files: string[] = [];
  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(full);
        } else if (entry.isFile() && /\.(tsx?|jsx?|css|json|md)$/i.test(entry.name)) {
          files.push(full);
        }
      }
    } catch { /* skip unreadable */ }
  }
  if (existsSync(projectDir)) walk(projectDir);
  return files;
}

function findFiles(files: string[], patterns: RegExp[]): string[] {
  return files.filter(f => patterns.some(p => p.test(f)));
}

function makeRelative(files: string[], root: string): string[] {
  return files.map(f => f.startsWith(root) ? f.slice(root.length + 1) : f);
}

const DIMENSION_RULES: DimensionRule[] = [
  {
    key: 'presentation',
    label: 'Presentation',
    actionType: 'enhance_ui',
    buildTarget: (files) => {
      const pages = findFiles(files, [/\/app\/.*page\.tsx?$/, /\/pages\/.*\.tsx?$/, /\/src\/.*page\.tsx?$/]);
      return pages.length > 0 ? makeRelative(files, '').find(f => /page\.tsx?$/.test(f)) ?? 'src/app/page.tsx' : 'src/app/page.tsx';
    },
    buildDescription: (score, label) => `Improve ${label.toLowerCase()} — current score ${score}/100. Add visual polish, responsive layout, and clear information hierarchy.`,
    buildImplementation: (score, label, files) => `Enhance the main page component with: (1) responsive grid layout using Tailwind breakpoints, (2) clear visual hierarchy with headings and spacing, (3) consistent color scheme and typography, (4) loading and empty states for all data-fetching sections. Target: raise the ${label.toLowerCase()} score from ${score} to at least 75.`,
  },
  {
    key: 'completeness',
    label: 'Completeness',
    actionType: 'add_feature',
    buildTarget: (files) => {
      const pages = findFiles(files, [/\/app\/.*page\.tsx?$/, /\/pages\/.*\.tsx?$/, /\/src\/.*page\.tsx?$/]);
      return pages.length > 0 ? makeRelative(files, '').find(f => /page\.tsx?$/.test(f)) ?? 'src/app/page.tsx' : 'src/app/page.tsx';
    },
    buildDescription: (score) => `Improve completeness — current score ${score}/100. Add missing UI states (loading, empty, error) and polish edge cases.`,
    buildImplementation: (score) => `Add the following UI states to existing components: (1) loading skeleton for async content, (2) empty state with call-to-action when no data, (3) error boundary with retry button, (4) toast notifications for user actions. These states are required for a polished user experience and will raise completeness from ${score} to 80+.`,
  },
  {
    key: 'maintainability',
    label: 'Maintainability',
    actionType: 'add_docs',
    buildTarget: () => 'README.md',
    buildDescription: (score) => `Improve maintainability — current score ${score}/100. Add documentation and organize code structure.`,
    buildImplementation: (score) => `Add to README.md: (1) project overview and architecture diagram (ASCII), (2) setup and run instructions, (3) folder structure explanation, (4) available scripts and their purposes, (5) deployment guide. Clean up any commented-out code and ensure consistent import ordering. This will raise maintainability from ${score} to 75+.`,
  },
  {
    key: 'technicalDepth',
    label: 'Technical depth',
    actionType: 'fix_issue',
    buildTarget: (files) => {
      const tsx = findFiles(files, [/\.tsx?$/]);
      return tsx.length > 0 ? makeRelative(files, '').find(f => /\.tsx?$/.test(f)) ?? 'src/app/page.tsx' : 'src/app/page.tsx';
    },
    buildDescription: (score) => `Improve technical depth — current score ${score}/100. Add type safety, error handling, and proper abstractions.`,
    buildImplementation: (score, label, files) => {
      const tsFiles = makeRelative(files, '').filter(f => /\.tsx?$/.test(f));
      return `Strengthen the codebase: (1) add proper TypeScript types to all function parameters and returns in ${tsFiles.slice(0, 3).join(', ')}${tsFiles.length > 3 ? ` and ${tsFiles.length - 3} other files` : ''}, (2) wrap API calls with try/catch and user-friendly error messages, (3) extract repeated logic into reusable hooks or utilities, (4) add input validation for user-facing forms. This will raise technical depth from ${score} to 70+.`;
    },
  },
  {
    key: 'innovation',
    label: 'Innovation',
    actionType: 'add_feature',
    buildTarget: (files) => {
      const pages = findFiles(files, [/\/app\/.*page\.tsx?$/, /\/pages\/.*\.tsx?$/, /\/src\/.*page\.tsx?$/]);
      return pages.length > 0 ? makeRelative(files, '').find(f => /page\.tsx?$/.test(f)) ?? 'src/app/page.tsx' : 'src/app/page.tsx';
    },
    buildDescription: (score) => `Improve innovation — current score ${score}/100. Add a distinctive feature that makes the project memorable.`,
    buildImplementation: (score) => `Add a "wow" feature: (1) a real-time preview or live-updating component that demonstrates the core value proposition, (2) a thoughtful micro-interaction (animated transition, hover effect with purpose) that feels polished, (3) a data visualization or insight that surprises the user. Judges remember demos with a clear "wow moment". This should raise innovation from ${score} to 75+.`,
  },
  {
    key: 'feasibility',
    label: 'Feasibility',
    actionType: 'add_deployment',
    buildTarget: () => 'vercel.json',
    buildDescription: (score) => `Improve feasibility — current score ${score}/100. Add deployment configuration and production readiness.`,
    buildImplementation: () => `Add deployment configuration: (1) vercel.json with appropriate settings (framework, routes, environment variables), (2) Dockerfile for containerized deployment if not present, (3) .env.example with all required environment variables documented, (4) production build script that runs without errors. A deployable project demonstrates real-world feasibility.`,
  },
  {
    key: 'judgeAlignment',
    label: 'Judge alignment',
    actionType: 'add_docs',
    buildTarget: () => 'DEMO.md',
    buildDescription: (score) => `Improve judge alignment — current score ${score}/100. Add judging-focused documentation.`,
    buildImplementation: (score) => `Create DEMO.md with: (1) a 60-second demo script walking judges through the problem, solution, and wow moment, (2) explicit mapping of features to judging criteria, (3) talking points for Q&A, (4) a one-sentence elevator pitch. Ensure README.md mentions which sponsor APIs are used and how. This raises judge alignment from ${score} to 75+.`,
  },
];

function scoreToPriority(score: number): ActionPriority {
  if (score < 50) return 'critical';
  if (score < 70) return 'high';
  if (score < 85) return 'medium';
  return 'low';
}

let actionCounter = 0;
function nextActionId(): string {
  actionCounter++;
  return `improve-${String(actionCounter).padStart(3, '0')}`;
}

export function planImprovements(judgeResult: JudgeResult, projectDir: string): ImprovementAction[] {
  const files = scanProjectFiles(projectDir);
  const relFiles = makeRelative(files, projectDir);

  const sortedDimensions = [...DIMENSION_RULES]
    .map(rule => ({
      rule,
      score: judgeResult.scores[rule.key],
    }))
    .sort((a, b) => a.score - b.score);

  const actions: ImprovementAction[] = [];

  for (const { rule, score } of sortedDimensions) {
    if (actions.length >= 5) break;

    const priority = scoreToPriority(score);
    const target = rule.buildTarget(relFiles);
    const description = rule.buildDescription(score, rule.label);
    const implementation = rule.buildImplementation(score, rule.label, relFiles);

    actions.push({
      id: nextActionId(),
      type: rule.actionType,
      target,
      description,
      priority,
      expectedScoreIncrease: score < 50 ? 15 : score < 70 ? 10 : 5,
      implementation,
    });
  }

  return actions;
}
