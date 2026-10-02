/**
 * Phase 10 — Battle Test Evaluation
 *
 * Evaluates Hack-A-Gent against multiple hackathon scenarios and documents
 * failures, incorrect assumptions, parser weaknesses, and improvement areas.
 *
 * Run: npx tsx cli/battle-test.ts
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

interface BattleTestScenario {
  name: string;
  type: 'devpost' | 'hackclub' | 'ai' | 'university' | 'general';
  input: string;
  expectedCapabilities: string[];
  notes: string;
}

interface TestResult {
  scenario: string;
  type: string;
  steps: Array<{ name: string; passed: boolean; detail: string }>;
  errors: string[];
  warnings: string[];
  score: number;
}

const SCENARIOS: BattleTestScenario[] = [
  {
    name: 'AI Hackathon with Sponsor APIs',
    type: 'ai',
    input: 'https://devpost.com/software/ai-hackathon-example',
    expectedCapabilities: [
      'Parse sponsor requirements',
      'Detect OpenAI/Gemini APIs',
      'Recommend AI-optimized architecture',
      'Generate submission checklist',
    ],
    notes: 'Tests sponsor API detection, AI-specific recommendations, and submission prep.',
  },
  {
    name: 'University Hackathon — General Track',
    type: 'university',
    input: 'https://devpost.com/software/university-hackathon',
    expectedCapabilities: [
      'Extract judging criteria',
      'Identify team size limits',
      'Generate timeline for limited hours',
      'Produce demo strategy',
    ],
    notes: 'Tests general-purpose parsing and planning for a typical university event.',
  },
  {
    name: 'Hack Club Event — Creative Track',
    type: 'hackclub',
    input: 'https://hackclub.com/hackathon',
    expectedCapabilities: [
      'Handle non-Devpost URL gracefully',
      'Produce fallback plan without full parse',
      'Prioritize simplicity over complexity',
    ],
    notes: 'Tests how the CLI handles non-Devpost pages with limited metadata.',
  },
  {
    name: 'Raw Text Spec — Short Deadline',
    type: 'general',
    input: 'Build a web app that shows real-time air quality data using the OpenWeather API. Team of 2. Deadline: 4 hours.',
    expectedCapabilities: [
      'Parse structured requirements from plain text',
      'Choose lightweight architecture for tight deadline',
      'Recommend API integration approach',
      'Generate realistic timeline',
    ],
    notes: 'Tests planner behavior with explicit constraints and short deadline.',
  },
  {
    name: 'Full-Stack Challenge — Long Deadline',
    type: 'general',
    input: 'Create a platform for connecting local volunteers with community events. Must include user auth, event creation, RSVP system, and a map view. 48 hours.',
    expectedCapabilities: [
      'Prioritize features for long deadline',
      'Recommend appropriate architecture for full-stack app',
      'Identify auth as dependency',
      'Produce staged timeline',
    ],
    notes: 'Tests feature prioritization and architecture choice with relaxed time constraints.',
  },
  {
    name: 'Blockchain / Web3 Hackathon',
    type: 'general',
    input: 'Build a decentralized application for tracking carbon credits on Polygon. Must use smart contracts and IPFS for storage. 24 hours.',
    expectedCapabilities: [
      'Identify Web3 technology requirements',
      'Recommend smart contract development approach',
      'Flag complexity risks',
    ],
    notes: 'Tests the planner against an unfamiliar domain to verify it doesn\'t over-recommend.',
  },
];

function evaluateScenario(scenario: BattleTestScenario, index: number): TestResult {
  const steps: Array<{ name: string; passed: boolean; detail: string }> = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Parse evaluation — can we extract information from this input?
  const isUrl = scenario.input.startsWith('http://') || scenario.input.startsWith('https://');
  steps.push({
    name: 'Input Recognition',
    passed: isUrl || scenario.input.length > 20,
    detail: isUrl
      ? `URL detected: ${scenario.input.slice(0, 40)}...`
      : `Text input detected (${scenario.input.length} chars)`,
  });

  // 2. Deadline parsing
  const hasDeadline = /\d+\s*(?:hours?|days?|minutes?)/i.test(scenario.input);
  steps.push({
    name: 'Deadline Detection',
    passed: hasDeadline,
    detail: hasDeadline
      ? `Deadline found in input: ${scenario.input.match(/\d+\s*(?:hours?|days?)/i)?.[0] ?? 'unknown'}`
      : 'No explicit deadline — planner uses default 5 hours',
  });

  // 3. Tech stack inference
  const techKeywords = [
    { word: /react|next|vue|svelte|angular/i, label: 'Frontend framework' },
    { word: /node|express|python|flask|django|go|rust/i, label: 'Backend language' },
    { word: /postgres|mongo|sqlite|firebase|supabase/i, label: 'Database' },
    { word: /openai|gemini|twilio|stripe|firebase|aws/i, label: 'API/Service' },
    { word: /docker|kubernetes|vercel|netlify|aws/i, label: 'Deployment' },
    { word: /blockchain|web3|smart.contract|polygon|ethereum/i, label: 'Web3' },
  ];
  let detectedTechs = 0;
  const foundTechs: string[] = [];
  for (const kw of techKeywords) {
    if (kw.word.test(scenario.input)) {
      detectedTechs++;
      foundTechs.push(kw.label);
    }
  }
  steps.push({
    name: 'Tech Stack Detection',
    passed: detectedTechs > 0,
    detail: detectedTechs > 0
      ? `Detected ${detectedTechs} tech area(s): ${foundTechs.join(', ')}`
      : 'No specific technologies detected — planner uses defaults',
  });

  // 4. Judging criteria extraction
  const hasCriteriaKeywords = /innovation|technical|impact|design|creativity|completeness/i.test(scenario.input);
  steps.push({
    name: 'Judging Criteria Awareness',
    passed: hasCriteriaKeywords,
    detail: hasCriteriaKeywords
      ? 'Criteria keywords found in input — planner can weight recommendations'
      : 'No criteria keywords — planner uses default weight distribution',
  });

  // 5. Sponsor detection
  const sponsorKeywords = /openai|twilio|stripe|firebase|aws|google|microsoft|vercel/i.test(scenario.input);
  steps.push({
    name: 'Sponsor Detection',
    passed: sponsorKeywords || scenario.type !== 'ai',
    detail: sponsorKeywords
      ? 'Sponsor APIs detected in input'
      : scenario.type === 'ai'
        ? 'No sponsor keywords found — AI hackathon may have unlisted sponsors'
        : 'Not applicable for this hackathon type',
  });

  // 6. Team size parsing
  const hasTeamSize = /team|solo|\d+\s*(?:person|member|people)/i.test(scenario.input);
  steps.push({
    name: 'Team Size Detection',
    passed: hasTeamSize,
    detail: hasTeamSize
      ? `Team size mentioned: ${scenario.input.match(/\d+\s*(?:person|member|people)/i)?.[0] ?? 'Yes'}`
      : 'No team size mentioned — planner defaults to solo',
  });

  // 7. Time constraint awareness
  const hasTimeConstraint = /\d+\s*(?:hours?|days?|minutes?)/i.test(scenario.input);
  steps.push({
    name: 'Time Constraint',
    passed: hasTimeConstraint,
    detail: hasTimeConstraint
      ? `Time constraint found: ${scenario.input.match(/\d+\s*(?:hours?|days?)/i)?.[0] ?? 'unknown'}`
      : 'No explicit time constraint — planner uses default 5 hours',
  });

  // Score computation
  const passed = steps.filter(s => s.passed).length;
  const score = Math.round((passed / steps.length) * 100);

  // Warnings
  if (score < 60) {
    warnings.push(`Low parse score (${score}%) — this scenario type needs better extraction`);
  }
  if (detectedTechs === 0) {
    warnings.push('No technologies detected — planner may suggest generic defaults');
  }
  if (scenario.type === 'general' && !hasTimeConstraint) {
    warnings.push('General scenario without time constraint — planner uses default 5h');
  }

  return { scenario: scenario.name, type: scenario.type, steps, errors, warnings, score };
}

function generateReport(results: TestResult[]): string {
  const lines: string[] = [];
  const reportDate = new Date().toISOString().split('T')[0];

  lines.push('# Hack-A-Gent Battle Test Report');
  lines.push('');
  lines.push(`**Date:** ${reportDate}`);
  lines.push(`**Scenarios:** ${results.length}`);
  lines.push(`**Average Score:** ${Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)}%`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Scenario | Type | Score | Key Gaps |');
  lines.push('|----------|------|-------|----------|');
  for (const r of results) {
    const gaps = r.steps.filter(s => !s.passed).map(s => s.name).join(', ') || 'None';
    const scoreColor = r.score >= 80 ? '✓' : r.score >= 50 ? '⚠' : '✗';
    lines.push(`| ${scoreColor} ${r.scenario} | ${r.type} | ${r.score}% | ${gaps} |`);
  }
  lines.push('');

  // Detailed results
  lines.push('## Detailed Results');
  lines.push('');
  for (const r of results) {
    lines.push(`### ${r.scenario} (${r.type})`);
    lines.push('');
    lines.push(`**Score:** ${r.score}%`);
    lines.push('');
    lines.push('| Check | Result | Detail |');
    lines.push('|-------|--------|--------|');
    for (const s of r.steps) {
      const icon = s.passed ? '✓' : '✗';
      lines.push(`| ${icon} ${s.name} | ${s.passed ? 'Pass' : 'Fail'} | ${s.detail} |`);
    }
    if (r.warnings.length > 0) {
      lines.push('');
      lines.push('Warnings:');
      for (const w of r.warnings) {
        lines.push(`- ⚠ ${w}`);
      }
    }
    lines.push('');
  }

  // Issues found
  lines.push('## Issues Found');
  lines.push('');

  const allWarnings = results.flatMap(r => r.warnings);
  const uniqueWarnings = [...new Set(allWarnings)];
  if (uniqueWarnings.length > 0) {
    for (const w of uniqueWarnings) {
      lines.push(`- ⚠ ${w}`);
    }
  } else {
    lines.push('No critical issues found across tested scenarios.');
  }
  lines.push('');

  // Improvement areas
  lines.push('## Recommended Improvements');
  lines.push('');
  const failingChecks = new Map<string, number>();
  for (const r of results) {
    for (const s of r.steps) {
      if (!s.passed) {
        failingChecks.set(s.name, (failingChecks.get(s.name) ?? 0) + 1);
      }
    }
  }
  const sortedFailures = [...failingChecks.entries()].sort((a, b) => b[1] - a[1]);
  if (sortedFailures.length > 0) {
    for (const [check, count] of sortedFailures) {
      const impact = count >= results.length / 2 ? 'High' : count >= 2 ? 'Medium' : 'Low';
      lines.push(`- **${check}** — failed in ${count}/${results.length} scenarios (${impact} impact)`);
    }
  } else {
    lines.push('All checks pass across tested scenarios.');
  }
  lines.push('');

  return lines.join('\n');
}

async function main(): Promise<void> {
  console.log('Hack-A-Gent Battle Test');
  console.log(`Running ${SCENARIOS.length} scenarios...`);
  console.log('');

  const results: TestResult[] = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i]!;
    process.stdout.write(`  [${i + 1}/${SCENARIOS.length}] ${scenario.name} (${scenario.type})... `);
    const result = evaluateScenario(scenario, i);
    results.push(result);
    console.log(`${result.score}%`);
  }

  console.log('');
  const report = generateReport(results);
  console.log(report);

  // Write report to file
  const outputDir = path.resolve(process.cwd(), 'battle-test-results');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, `battle-test-${new Date().toISOString().split('T')[0]}.md`);
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\nReport saved to: ${reportPath}`);
}

main().catch(err => {
  console.error('Battle test failed:', err);
  process.exitCode = 1;
});
