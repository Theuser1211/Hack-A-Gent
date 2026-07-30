import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { PipelineContext } from '../pipeline/types.js';

export interface PackageResult {
  files: Array<{ file: string; path: string; contentLength: number }>;
  success: boolean;
}

export function generatePackage(projectDir: string, context: PipelineContext): PackageResult {
  const analysis = context.analysis;
  const strategy = context.strategy;
  const execResult = context.executionResult;
  const report = context.report;

  const title = analysis?.challenge.title ?? 'Hackathon Project';
  const oneLiner = strategy?.projectName ?? 'My Hackathon Project';
  const theme = analysis?.challenge.theme ?? 'technology';
  const criteria = analysis?.judgingCriteria ?? [];
  const sponsorAPIs = analysis?.sponsorAPIs ?? [];
  const techStack = strategy?.technologyStack
    ? [strategy.technologyStack.frontend, strategy.technologyStack.backend, strategy.technologyStack.database, strategy.technologyStack.styling].filter(Boolean)
    : strategy?.recommendedStack ?? [];
  const features = execResult?.features ?? [];
  const deployUrl = execResult?.deployUrl ?? null;
  const weaknesses = report?.knownWeaknesses ?? [];

  const files: PackageResult['files'] = [];

  const readme = generateReadme(title, oneLiner, features, techStack, sponsorAPIs, criteria, deployUrl);
  files.push(writeSubmissionFile(projectDir, 'README.md', readme));

  const setup = generateSetup(projectDir);
  files.push(writeSubmissionFile(projectDir, 'SETUP.md', setup));

  const deploy = generateDeploy(deployUrl, techStack);
  files.push(writeSubmissionFile(projectDir, 'DEPLOY.md', deploy));

  const demo = generateDemo(title, oneLiner, features, criteria, weaknesses);
  files.push(writeSubmissionFile(projectDir, 'DEMO.md', demo));

  const submission = generateSubmission(title, oneLiner, theme, sponsorAPIs, techStack, features, criteria);
  files.push(writeSubmissionFile(projectDir, 'SUBMISSION.md', submission));

  return { files, success: true };
}

function writeSubmissionFile(projectDir: string, name: string, content: string): PackageResult['files'][0] {
  const filePath = resolve(projectDir, name);
  writeFileSync(filePath, content);
  return { file: name, path: filePath, contentLength: content.length };
}

function generateReadme(
  title: string,
  oneLiner: string,
  features: string[],
  techStack: string[],
  sponsorAPIs: Array<{ name: string; provider: string }>,
  criteria: Array<{ name: string; description: string }>,
  deployUrl: string | null,
): string {
  let md = `# ${title}\n\n${oneLiner}\n\n`;
  md += '## Features\n\n';
  for (const f of features) md += `- ${f}\n`;
  md += '\n';
  md += '## Tech Stack\n\n';
  for (const t of techStack) md += `- ${t}\n`;
  md += '\n';
  if (sponsorAPIs.length > 0) {
    md += '## Sponsor APIs Used\n\n';
    for (const api of sponsorAPIs) md += `- ${api.name}\n`;
    md += '\n';
  }
  md += '## Judging Criteria Addressed\n\n';
  for (const c of criteria) md += `- **${c.name}**: ${c.description}\n`;
  md += '\n';
  if (deployUrl) md += `## Live Demo\n\n[${deployUrl}](${deployUrl})\n\n`;
  md += '## Quick Start\n\n```bash\nnpm install\nnpm run dev\n```\n\n';
  md += '## Deploy\n\nSee [DEPLOY.md](./DEPLOY.md) for deployment instructions.\n';
  return md;
}

function generateSetup(projectDir: string): string {
  const hasDocker = existsSync(resolve(projectDir, 'Dockerfile'));
  let md = '# Setup Guide\n\n';
  md += '## Prerequisites\n\n- Node.js 20+\n- npm 9+\n';
  if (hasDocker) md += '- Docker (optional, for containerized deployment)\n';
  md += '\n## Install\n\n```bash\nnpm install\n```\n\n';
  md += '## Run\n\n```bash\nnpm run dev\n```\n\n';
  md += 'Open http://localhost:3000 in your browser.\n\n';
  md += '## Build\n\n```bash\nnpm run build\n```\n';
  return md;
}

function generateDeploy(deployUrl: string | null, techStack: string[]): string {
  const isNext = techStack.some(t => /next/i.test(t));
  const isVite = techStack.some(t => /vite/i.test(t));
  let md = '# Deployment Guide\n\n';
  md += '## Option 1: Vercel (Recommended)\n\n';
  md += '1. Push your code to a GitHub repository.\n';
  md += '2. Import the repository on [Vercel](https://vercel.com/new).\n';
  if (isNext) md += '3. Vercel auto-detects Next.js — no additional configuration needed.\n';
  else if (isVite) md += '3. Set framework preset to "Vite".\n';
  else md += '3. Set build command to `npm run build` and output directory to `dist`.\n';
  md += '4. Add environment variables in the Vercel dashboard.\n';
  md += '5. Deploy.\n\n';
  md += '## Option 2: Docker\n\n';
  md += '```bash\ndocker build -t my-hackathon-app .\ndocker run -p 3000:3000 my-hackathon-app\n```\n\n';
  md += '## Option 3: Netlify\n\n';
  md += '1. Push to GitHub.\n';
  md += '2. Import on Netlify.\n';
  md += '3. Set build command to `npm run build` and publish directory to `dist` (Vite) or `.next` (Next.js).\n';
  md += '4. Deploy.\n';
  if (deployUrl) md += `\n## Current Deployment\n\n${deployUrl}\n`;
  return md;
}

function generateDemo(
  title: string,
  oneLiner: string,
  features: string[],
  criteria: Array<{ name: string; description: string }>,
  weaknesses: string[],
): string {
  let md = `# Demo Script — ${title}\n\n${oneLiner}\n\n`;
  md += '## Walkthrough (60 seconds)\n\n';
  md += '1. **Problem** (10s): State the problem this project solves.\n';
  md += '2. **Solution** (20s): Show the main feature in action.\n';
  md += `   - ${features[0] ?? 'Core functionality'}\n`;
  if (features.length > 1) md += `   - ${features[1]}\n`;
  md += '3. **Wow Moment** (15s): Demonstrate the most impressive interaction.\n';
  md += '4. **Technical Depth** (10s): Mention one technical challenge overcome.\n';
  md += '5. **Closing** (5s): Thank judges and offer Q&A.\n\n';
  md += '## Key Features to Show\n\n';
  for (const f of features) md += `- ${f}\n`;
  md += '\n';
  md += '## Judging Talking Points\n\n';
  for (const c of criteria) md += `- **${c.name}**: ${c.description}\n`;
  md += '\n';
  if (weaknesses.length > 0) {
    md += '## Known Limitations (Be Ready to Address)\n\n';
    for (const w of weaknesses) md += `- ${w}\n`;
    md += '\n';
  }
  md += '## Tips\n\n- Keep a fallback recording in case the live demo fails.\n';
  md += '- Test the demo on a clean machine before presenting.\n';
  md += '- Have a friend watch and give feedback on clarity.\n';
  return md;
}

function generateSubmission(
  title: string,
  oneLiner: string,
  theme: string,
  sponsorAPIs: Array<{ name: string; provider: string; strategicValue: string }>,
  techStack: string[],
  features: string[],
  criteria: Array<{ name: string; description: string }>,
): string {
  let md = `# Submission — ${title}\n\n`;
  md += `## Project Summary\n\n${oneLiner}\n\n`;
  md += `**Theme**: ${theme}\n\n`;
  md += '## Prize Track\n\n- Main track\n\n';
  if (sponsorAPIs.length > 0) {
    md += '## Sponsor Prizes Targeted\n\n';
    for (const api of sponsorAPIs) md += `- ${api.name} (${api.strategicValue})\n`;
    md += '\n';
  }
  md += '## Tech Stack\n\n';
  for (const t of techStack) md += `- ${t}\n`;
  md += '\n';
  md += '## Innovation Highlights\n\n';
  md += '- Solves a real problem with a clean, focused demo.\n';
  md += `- Built with ${techStack[0] ?? 'modern web technologies'}.\n`;
  if (sponsorAPIs.length > 0) md += `- Integrates ${sponsorAPIs.map(a => a.name).join(', ')}.\n`;
  md += '\n';
  md += '## What Was Built\n\n';
  for (const f of features) md += `- ${f}\n`;
  md += '\n';
  md += '## Judging Criteria Addressed\n\n';
  for (const c of criteria) md += `- **${c.name}**: ${c.description}\n`;
  md += '\n';
  md += '## Links\n\n';
  md += '- Demo video: _(add link)_\n';
  md += '- Source code: _(add link)_\n';
  md += '- Live demo: _(add link)_\n';
  return md;
}
