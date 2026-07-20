import { CompetitionIntelligence } from './pipeline/competition-intelligence.js';
import { info, error, ask, stageStart, stageDone, showPlan } from './output.js';
import { buildContext, determineMissingInfo } from './hackathon-context.js';
import { HackathonPlanner } from './planner.js';
import { parseDevpostUrl } from './pipeline/parsing.js';
import { detectRepo } from './repo-detector.js';
import { formatConfidence } from './confidence.js';
import { UserMemory } from './user-memory.js';
import type { CLIContext, CLIResult } from './types.js';

function seedFromUrl(url: string): number {
  let seed = 42;
  const urlHash = url.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  seed = (seed * 31 + urlHash) % 2147483647;
  return seed;
}

function showConfidence(
  label: string,
  value: string | number,
  level: 'confirmed' | 'inferred' | 'unknown',
): void {
  if (level === 'unknown') return; // Don't show unknown fields
  const tag = level === 'confirmed' ? '[confirmed]' : '[inferred]';
  info(`${label}: ${value} ${tag}`);
}

/**
 * Interactive entry point — adaptive interview with confidence tagging.
 *
 * 1. User enters a URL
 * 2. Parse it immediately with confidence levels
 * 3. Show what was extracted (with confidence indicators)
 * 4. Auto-detect existing repository if present
 * 5. Ask only unanswered questions (2-4 max)
 * 6. Show execution plan
 * 7. Auto-launch pipeline
 */
export async function runInteractiveEntry(ctx: CLIContext): Promise<CLIResult> {
  console.log();
  info('Paste a hackathon link. I\'ll build your submission.');
  console.log();

  // Step 1: Get the URL
  const url = await ask('Hackathon URL (Devpost, MLH, etc.): ');
  if (!url) {
    error('A hackathon URL is required.');
    return { success: false, message: 'No URL provided.' };
  }

  // Step 2: Parse the URL immediately
  stageStart('Reading challenge');
  let analysis = null;
  let parseConfidence = null;
  try {
    let parseResult;
    if (url.includes('devpost.com')) {
      parseResult = await parseDevpostUrl(url);
    } else {
      // For non-Devpost URLs, flag everything as unknown
      parseResult = {
        title: '',
        problemStatement: `Build a solution based on: ${url}`,
        judgingCriteria: [],
        constraints: [],
        recommendedStack: [],
        rawText: url,
        submissionRequirements: [],
        confidence: {
          title: { value: '', confidence: 'unknown' as const },
          judgingCriteria: { value: [], confidence: 'unknown' as const },
          deadlines: { value: [], confidence: 'unknown' as const },
          sponsorAPIs: { value: [], confidence: 'unknown' as const },
          organizer: { value: '', confidence: 'unknown' as const },
          techStack: { value: [], confidence: 'unknown' as const },
          restrictions: { value: [], confidence: 'unknown' as const },
        },
      };
    }

    const intelligence = new CompetitionIntelligence();
    analysis = intelligence.analyze(parseResult);
    parseConfidence = parseResult.confidence;
    stageDone('Rules extracted');
  } catch (err) {
    stageDone('Rules extracted (partial)');
    info(`Could not fully parse: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (analysis) {
    const conf = analysis.extractionConfidence;

    // Show what was extracted with confidence indicators
    if (conf?.title.confidence !== 'unknown') {
      showConfidence('Hackathon', analysis.challenge.title, conf!.title.confidence);
    }
    if (conf?.organizer.confidence !== 'unknown') {
      showConfidence('Organizer', analysis.challenge.organizer, conf!.organizer.confidence);
    }
    if (analysis.challenge.theme && analysis.challenge.theme !== 'General') {
      showConfidence('Theme', analysis.challenge.theme, conf?.theme.confidence ?? 'inferred');
    }
    if (analysis.judgingCriteria.length > 0) {
      const top = [...analysis.judgingCriteria].sort((a, b) => b.weight - a.weight).slice(0, 3);
      const tag = conf?.judgingCriteria.confidence === 'confirmed' ? ' [confirmed]' :
                  conf?.judgingCriteria.confidence === 'inferred' ? ' [inferred]' : '';
      info(`Top criteria: ${top.map(c => `${c.name} (${c.weight}%)`).join(', ')}${tag}`);
    }
    if (analysis.sponsorAPIs.length > 0) {
      const tag = conf?.sponsorAPIs.confidence === 'confirmed' ? ' [confirmed]' :
                  conf?.sponsorAPIs.confidence === 'inferred' ? ' [inferred]' : '';
      info(`Sponsors: ${analysis.sponsorAPIs.map(a => a.name).join(', ')}${tag}`);
    }
    if (analysis.deadlines.length > 0) {
      const sub = analysis.deadlines.find(d => d.type === 'submission');
      if (sub) {
        const tag = conf?.deadlines.confidence === 'inferred' ? ' [inferred]' : '';
        info(`Deadline: ${sub.date}${tag}`);
      }
    }

    // Show what couldn't be extracted
    if (conf) {
      const missing = [];
      if (conf.judgingCriteria.confidence === 'unknown') missing.push('judging criteria');
      if (conf.sponsorAPIs.confidence === 'unknown') missing.push('sponsor APIs');
      if (conf.deadlines.confidence === 'unknown') missing.push('deadlines');
      if (conf.restrictions.confidence === 'unknown') missing.push('restrictions');
      if (missing.length > 0) {
        info(`Not found on page: ${missing.join(', ')} — I can work with what I have.`);
      }
    }
  } else {
    info('Could not extract details from this URL. I will use what I can infer from the address.');
  }
  console.log();

  // Step 3: Auto-detect existing repository
  let hasExistingRepo = false;
  const cwd = process.cwd();
  const repoAnalysis = detectRepo(cwd);
  if (repoAnalysis.hasRepo) {
    stageStart('Detecting existing project');
    hasExistingRepo = true;
    if (repoAnalysis.framework.confidence !== 'unknown') {
      info(`Framework: ${repoAnalysis.framework.value} [${formatConfidence(repoAnalysis.framework.confidence)}]`);
    }
    if (repoAnalysis.packageManager.confidence !== 'unknown') {
      info(`Package manager: ${repoAnalysis.packageManager.value} [${formatConfidence(repoAnalysis.packageManager.confidence)}]`);
    }
    if (repoAnalysis.language.confidence !== 'unknown') {
      info(`Language: ${repoAnalysis.language.value} [${formatConfidence(repoAnalysis.language.confidence)}]`);
    }
    if (repoAnalysis.deploymentTarget.confidence !== 'unknown') {
      info(`Deployment: ${repoAnalysis.deploymentTarget.value} [${formatConfidence(repoAnalysis.deploymentTarget.confidence)}]`);
    }
    stageDone('Project detected');
  }

  // Step 4: Load user memory for preference reuse
  const userMemory = new UserMemory(ctx.dataDir);
  const memoryStack = !repoAnalysis?.hasRepo ? userMemory.getMostUsedStack() : null;
  const memoryApplied = userMemory.apply({
    preferredStack: repoAnalysis?.framework.confidence !== 'unknown' ? repoAnalysis!.framework.value : (memoryStack ?? null),
  });
  for (const msg of memoryApplied.messages) {
    info(msg);
  }

  // Step 5: Build initial context with what we know (prefer memory stack if nothing detected)
  const stackFromMemory = !repoAnalysis?.hasRepo && memoryStack
    ? memoryStack
    : undefined;
  const baseContext = buildContext(analysis, {
    url,
    preferredStack: stackFromMemory,
    hasExistingRepo: hasExistingRepo ? 'yes' : undefined,
  });

  // Step 6: Determine what we still need to ask
  const missingInfo = determineMissingInfo(baseContext);

  // Step 7: Ask only unknown questions
  const answers: Record<string, string> = {};
  for (const q of missingInfo) {
    const answer = await ask(q.question);
    if (answer) answers[q.key] = answer;
  }

  console.log();

  // Step 8: Build final context (use memory as fallback when user doesn't specify)
  const context = buildContext(analysis, {
    url,
    projectName: answers.projectName || null,
    preferredStack: repoAnalysis?.framework.confidence !== 'unknown'
      ? repoAnalysis!.framework.value
      : (answers.preferredStack || stackFromMemory || null),
    teamSize: answers.teamSize || null,
    hoursRemaining: answers.hoursRemaining || null,
    primaryGoal: answers.primaryGoal || null,
    hasExistingRepo: hasExistingRepo ? 'yes' : (answers.hasExistingRepo || null),
  });

  // Step 9: Generate execution plan
  const planner = new HackathonPlanner(context);
  const plan = planner.plan();
  showPlan(plan);
  info('Starting build...');
  console.log();

  // Step 10: Auto-launch the pipeline
  const seed = seedFromUrl(url);
  const { runCommand } = await import('./commands/run.js');
  const runArgs = {
    command: 'run' as const,
    subcommand: undefined,
    positional: [url],
    flags: {
      seed,
      ...(context.projectName ? { name: context.projectName } : {}),
      ...(context.preferredStack.length > 0 ? { stack: context.preferredStack[0] } : {}),
      ...(context.teamSize > 1 ? { team: context.teamSize } : {}),
      ...(context.hoursRemaining ? { deadline: context.hoursRemaining } : {}),
      ...(context.primaryGoal ? { goal: context.primaryGoal } : {}),
    },
  };

  try {
    return await runCommand(ctx, runArgs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Pipeline failed: ${msg}`);
    return { success: false, message: msg };
  }
}
