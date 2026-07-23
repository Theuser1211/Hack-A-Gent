import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

export interface SubmissionCheck {
  name: string;
  passed: boolean;
  detail: string;
  severity: 'required' | 'recommended' | 'optional';
}

export interface SubmissionReport {
  ready: boolean;
  checks: SubmissionCheck[];
  blockers: string[];
  warnings: string[];
}

/**
 * Reviews a generated project directory against submission requirements
 * and produces an honest, actionable checklist. Never fabricates completion —
 * every check reads actual files or uses pipeline result data.
 */
export class SubmissionAssistant {
  /**
   * Generate a submission readiness report from a project directory
   * and pipeline execution results.
   */
  assess(params: {
    projectDir: string;
    projectName: string;
    deployUrl: string | null;
    errors: string[];
    sponsorAPIs: string[];
    judgingCriteria: string[];
    submissionRequirements: string[];
    completedFeatures: string[];
    pipelinePhase: string;
  }): SubmissionReport {
    const checks: SubmissionCheck[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. README exists
    const readmePaths = ['README.md', 'readme.md', 'README.txt', 'Readme.md'];
    const foundReadme = readmePaths.some(p => existsSync(path.join(params.projectDir, p)));
    checks.push({
      name: 'README',
      passed: foundReadme,
      detail: foundReadme
        ? 'README found in project root'
        : 'No README found — judges expect documentation of what was built',
      severity: 'required',
    });
    if (!foundReadme) blockers.push('Missing README — add a README.md explaining the project');

    // 2. Demo / Deployment
    const hasDeployUrl = !!params.deployUrl && !params.deployUrl.includes('/mock/');
    checks.push({
      name: 'Live Demo',
      passed: hasDeployUrl,
      detail: hasDeployUrl
        ? `Deployed at ${params.deployUrl}`
        : 'No live deployment URL — deploy to Vercel/Netlify for a working demo link',
      severity: 'required',
    });
    if (!hasDeployUrl) blockers.push('No live demo — deploy the project and add the URL to your submission');

    // 3. Screenshots
    let screenshotCount = 0;
    const walkDirForImages = (dir: string): void => {
      if (!existsSync(dir)) return;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        try {
          if (statSync(fullPath).isDirectory()) {
            if (entry !== 'node_modules' && entry !== '.next' && entry !== '.git') {
              walkDirForImages(fullPath);
            }
          } else if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(entry)) {
            screenshotCount++;
          }
        } catch {
          // skip unreadable entries
        }
      }
    };
    walkDirForImages(params.projectDir);
    checks.push({
      name: 'Screenshots',
      passed: screenshotCount > 0,
      detail: screenshotCount > 0
        ? `${screenshotCount === 1 ? `1 image found in project` : `${screenshotCount} images found in project`}`
        : 'No screenshots found — add at least one screenshot of your working app for the submission',
      severity: 'recommended',
    });
    if (screenshotCount === 0) {
      warnings.push('Add screenshots — submissions with images score higher with judges');
    }

    // 4. Required files check
    const requiredFiles = [
      { path: 'package.json', label: 'package.json' },
      { path: 'tsconfig.json', label: 'TypeScript config' },
      { path: 'src/app/layout.tsx', label: 'App layout' },
      { path: 'src/app/page.tsx', label: 'Main page' },
    ];
    let missingRequiredFiles = 0;
    for (const file of requiredFiles) {
      const fullPath = path.join(params.projectDir, file.path);
      const exists = existsSync(fullPath);
      if (!exists) missingRequiredFiles++;
      checks.push({
        name: file.label,
        passed: exists,
        detail: exists
          ? `${file.path} present`
          : `${file.path} missing — project may not build`,
        severity: 'required',
      });
    }
    if (missingRequiredFiles > 0) {
      blockers.push(`${missingRequiredFiles} required file(s) missing — check the checklist above`);
    }

    // 5. Sponsor requirements
    const parsedSponsors = params.sponsorAPIs;
    checks.push({
      name: 'Sponsor APIs',
      passed: parsedSponsors.length > 0,
      detail: parsedSponsors.length > 0
        ? `${parsedSponsors.length} sponsor API(s) identified: ${parsedSponsors.join(', ')}`
        : 'No sponsor APIs detected — check if the hackathon has sponsor prizes',
      severity: 'recommended',
    });

    // 6. Submission requirements from parsed challenge data
    checks.push({
      name: 'Submission Requirements',
      passed: params.submissionRequirements.length > 0,
      detail: params.submissionRequirements.length > 0
        ? `${params.submissionRequirements.length} requirement(s) parsed from challenge`
        : 'No submission requirements extracted — review the hackathon page manually',
      severity: 'recommended',
    });

    // 7. Build status
    const buildPassed = params.errors.length === 0 && params.pipelinePhase === 'complete';
    checks.push({
      name: 'Build Status',
      passed: buildPassed,
      detail: buildPassed
        ? 'Pipeline completed with no errors'
        : `Pipeline finished with ${params.errors.length} error(s) — review and fix before submitting`,
      severity: 'required',
    });
    if (!buildPassed && params.errors.length > 0) {
      blockers.push(`${params.errors.length} pipeline error(s) to resolve`);
    }

    // 8. Files in project — at least some content exists
    let fileCount = 0;
    const walkDirForCount = (dir: string): void => {
      if (!existsSync(dir)) return;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const fullPath = path.join(dir, entry);
        try {
          if (statSync(fullPath).isDirectory()) {
            if (entry !== 'node_modules' && entry !== '.next' && entry !== '.git') {
              walkDirForCount(fullPath);
            }
          } else {
            fileCount++;
          }
        } catch {
          // skip unreadable entries
        }
      }
    };
    walkDirForCount(params.projectDir);
    checks.push({
      name: 'Project Files',
      passed: fileCount > 3,
      detail: fileCount > 3
        ? `${fileCount} files in project (excluding node_modules)`
        : 'Very few files in project — ensure the generation completed fully',
      severity: 'recommended',
    });

    // 9. README quality — check for key sections
    let readmeHasSections = false;
    if (foundReadme) {
      const readmeFile = readmePaths.map(p => path.join(params.projectDir, p)).find(p => existsSync(p));
      if (readmeFile) {
        try {
          const readmeContent = readFileSync(readmeFile, 'utf-8');
          const hasTitle = /^#\s+\S/.test(readmeContent);
          const hasSetup = /(install|getting started|setup|run|usage)/i.test(readmeContent);
          const hasTech = /(tech|stack|built with|framework)/i.test(readmeContent);
          readmeHasSections = hasTitle && hasSetup;
          if (!hasTitle) warnings.push('README should start with a project title (# heading)');
          if (!hasSetup) warnings.push('README missing setup instructions — add how to run the project');
          if (!hasTech) warnings.push('README should mention the tech stack used');
        } catch {
          warnings.push('Could not read README file — check permissions');
        }
      }
    }
    checks.push({
      name: 'README Quality',
      passed: foundReadme && readmeHasSections,
      detail: foundReadme && readmeHasSections
        ? 'README has title and setup instructions'
        : foundReadme ? 'README exists but is missing key sections' : 'No README to evaluate',
      severity: 'recommended',
    });

    // 10. Judging criteria addressed
    if (params.judgingCriteria.length > 0) {
      checks.push({
        name: 'Judging Criteria',
        passed: true,
        detail: `${params.judgingCriteria.length} criteria identified — verify your project addresses each one in the submission description`,
        severity: 'recommended',
      });
    }

    const ready = blockers.length === 0;
    return { ready, checks, blockers, warnings };
  }

  /**
   * Format the submission checklist as a compact markdown string.
   */
  formatReport(report: SubmissionReport): string {
    const lines: string[] = [];
    lines.push('## Submission Checklist');
    lines.push('');

    for (const c of report.checks) {
      const icon = c.passed ? '✓' : '✗';
      const sev = c.severity === 'required' ? ' required' : '';
      lines.push(`${icon}${sev} ${c.name}`);
      lines.push(`   ${c.detail}`);
      lines.push('');
    }

    if (report.blockers.length > 0) {
      lines.push('### Blockers');
      for (const b of report.blockers) {
        lines.push(`⚠ ${b}`);
      }
      lines.push('');
    }

    if (report.warnings.length > 0) {
      lines.push('### Suggestions');
      for (const w of report.warnings) {
        lines.push(`• ${w}`);
      }
      lines.push('');
    }

    lines.push(report.ready ? '**Ready to submit**' : '**Needs work before submission**');
    return lines.join('\n');
  }
}
