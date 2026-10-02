/**
 * Generation Consistency Scanner
 *
 * Deterministic pass over the assembled file batch before any file is
 * written to disk. Detects pipeline consistency bugs (project-name drift,
 * placeholder text, generic sample data, mismatched README/app metadata,
 * stale project names from prior runs) and deterministically repairs what
 * it can. No LLM calls. Pure string / JSON inspection.
 */

import * as path from 'node:path';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface ConsistencyIssue {
  rule: string;
  severity: 'error' | 'warning';
  file: string;
  message: string;
}

export interface ConsistencyResult {
  valid: boolean;
  issues: ConsistencyIssue[];
  repairedFiles: Array<{ path: string; content: string }>;
}

/* ------------------------------------------------------------------ */
/*  Scan context — derived from plan + parsed input                   */
/* ------------------------------------------------------------------ */

export interface ScanContext {
  projectName: string;
  projectSlug: string;
  problemStatement: string;
  judgingCriteria: string[];
  techStack: string[];
}

/* ------------------------------------------------------------------ */
/*  Detector constants                                                */
/* ------------------------------------------------------------------ */

const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/, label: 'placeholder_comment' },
  { pattern: /lorem\s+ipsum/i, label: 'lorem_ipsum' },
  { pattern: /placeholder\s*text/i, label: 'placeholder_text' },
  { pattern: /your\s+\w+\s+here/i, label: 'fill_in_blank' },
  { pattern: /replace\s+with/i, label: 'replace_with' },
  { pattern: /coming\s+soon/i, label: 'coming_soon' },
  { pattern: /\bTBD\b/, label: 'tbd' },
];

const GENERIC_SAMPLE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /TypeError:\s*Cannot read properties of undefined/s, label: 'generic_typescript_error_sample' },
  { pattern: /Paste\s+(code|your\s+code|input\s+here)/i, label: 'generic_paste_prompt' },
  { pattern: /Describe\s+your\s+bug/i, label: 'generic_bug_prompt' },
  { pattern: /Diagnose\s+the\s+issue/i, label: 'generic_diagnose_prompt' },
  { pattern: /Analyze\s+the\s+input/i, label: 'generic_analyze_prompt' },
];

const GENERIC_LABEL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /Get\s+Started/i, label: 'generic_get_started' },
  { pattern: /Learn\s+More/i, label: 'generic_learn_more' },
  { pattern: /Click\s+here/i, label: 'generic_click_here' },
  { pattern: /Welcome/i, label: 'generic_welcome' },
  { pattern: /Dashboard/i, label: 'generic_dashboard' },
];

const GENERIC_WORDS = new Set([
  'app', 'project', 'myapp', 'myproject', 'demo', 'home', 'dashboard',
  'index', 'main', 'page', 'layout', 'root', 'example', 'sample', 'test',
  'welcome', 'getting-started', 'readme', 'todo', 'untitled',
]);

/* ------------------------------------------------------------------ */
/*  Scanner                                                           */
/* ------------------------------------------------------------------ */

export class GenerationConsistencyScanner {
  private readonly ctx: ScanContext;

  constructor(ctx: ScanContext) {
    this.ctx = ctx;
  }

  scan(files: Array<{ path: string; content: string }>): ConsistencyResult {
    const issues: ConsistencyIssue[] = [];
    const repairedFiles: Array<{ path: string; content: string }> = [];

    const byPath = new Map(files.map((f) => [f.path, f.content] as const));

    /* locate key artifacts */
    const readme = [...byPath.entries()].find(([p]) => /^README\.md$/i.test(path.basename(p)));
    const pkg = [...byPath.entries()].find(([p]) => /^package\.json$/i.test(path.basename(p)));
    const layouts = [...byPath.entries()].filter(([p]) => /layout\.(tsx|jsx|ts|js)$/i.test(path.basename(p)));
    const pages = [...byPath.entries()].filter(([p]) => /page\.(tsx|jsx|ts|js)$/i.test(path.basename(p)));

    /* 1. README consistency */
    if (readme) {
      const [rp, rc] = readme;
      const r = this.checkReadme(rp, rc);
      issues.push(...r.issues);
      if (r.repaired) repairedFiles.push({ path: rp, content: r.content });
    }

    /* 2. package.json consistency */
    if (pkg) {
      const [pp, pc] = pkg;
      const r = this.checkPackageJson(pp, pc);
      issues.push(...r.issues);
      if (r.repaired) repairedFiles.push({ path: pp, content: r.content });
    }

    /* 3. Metadata in layout files */
    for (const [lp, lc] of layouts) {
      const r = this.checkMetadata(lp, lc);
      issues.push(...r.issues);
      if (r.repaired) repairedFiles.push({ path: lp, content: r.content });
    }

    /* 4. Inline APP constants in page files */
    for (const [pp, pc] of pages) {
      const r = this.checkAppData(pp, pc);
      issues.push(...r.issues);
      if (r.repaired) repairedFiles.push({ path: pp, content: r.content });
    }

    /* 5. Placeholder scan */
    for (const [fp, fc] of byPath.entries()) {
      const ext = path.extname(fp).toLowerCase();
      if (!['.tsx', '.ts', '.jsx', '.js', '.md', '.json'].includes(ext)) continue;
      issues.push(...this.scanPatterns(fp, fc, PLACEHOLDER_PATTERNS, 'placeholder'));
    }

    /* 6. Generic sample data scan */
    for (const [fp, fc] of byPath.entries()) {
      const ext = path.extname(fp).toLowerCase();
      if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) continue;
      issues.push(...this.scanPatterns(fp, fc, GENERIC_SAMPLE_PATTERNS, 'generic_sample'));
    }

    /* 7. Generic label scan */
    for (const [fp, fc] of byPath.entries()) {
      const ext = path.extname(fp).toLowerCase();
      if (!['.tsx', '.ts', '.jsx', '.js'].includes(ext)) continue;
      issues.push(...this.scanPatterns(fp, fc, GENERIC_LABEL_PATTERNS, 'generic_label'));
    }

    /* 8. Stale / cross-project name contamination */
    for (const [fp, fc] of byPath.entries()) {
      issues.push(...this.scanStaleNames(fp, fc));
    }

    const errors = issues.filter((i) => i.severity === 'error');

    return {
      valid: errors.length === 0,
      issues,
      repairedFiles,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  README                                                            */
  /* ------------------------------------------------------------------ */

  private checkReadme(
    readmePath: string,
    content: string,
  ): { issues: ConsistencyIssue[]; repaired: boolean; content: string } {
    const issues: ConsistencyIssue[] = [];
    let repaired = false;
    let c = content;
    const name = this.ctx.projectName;

    /* H1 */
    const h1Match = c.match(/^#\s+(.+)$/m);
    if (h1Match) {
      const headerName = h1Match[1]!.trim();
      if (headerName !== name) {
        issues.push({
          rule: 'readme_title_mismatch',
          severity: 'error',
          file: readmePath,
          message: `README title is "${headerName}" but project name is "${name}"`,
        });
        c = c.replace(/^#\s+.+$/, `# ${name}`);
        repaired = true;
      }
    }

    /* Generic "Project from ..." title */
    if (/^#\s*Project\s+from\s+/i.test(c)) {
      issues.push({
        rule: 'readme_generic_title',
        severity: 'error',
        file: readmePath,
        message: 'README title is a generic "Project from ..."',
      });
      c = c.replace(/^#\s*Project\s+from\s+.*$/im, `# ${name}`);
      repaired = true;
    }

    /* Judging criteria — catch duplicate placeholder rows */
    const criteriaBlock = this.extractReadmeCriteria(c);
    if (criteriaBlock.length > 1) {
      const uniqueLines = new Set(criteriaBlock.map((l) => l.trim()));
      if (uniqueLines.size <= 1) {
        issues.push({
          rule: 'readme_duplicate_criteria',
          severity: 'warning',
          file: readmePath,
          message: 'All judging-criteria rows appear identical — likely placeholder',
        });
      }
      for (const line of criteriaBlock) {
        if (/test-hackathon\.html|placeholder/i.test(line)) {
          issues.push({
            rule: 'readme_criteria_placeholder',
            severity: 'error',
            file: readmePath,
            message: `Judging criteria contains placeholder: "${line.slice(0, 80)}"`,
          });
        }
      }
    }

    return { issues, repaired, content: c };
  }

  private extractReadmeCriteria(content: string): string[] {
    const lines: string[] = [];
    const tableMatch = content.match(/##\s+Judging\s+Criteria\s+Alignment\s*([\s\S]*)/i);
    if (!tableMatch) return lines;
    const body = tableMatch[1]!.split('\n').slice(2); /* skip header + separator */
    for (const line of body) {
      const cols = line.split('|').map((s) => s.trim()).filter(Boolean);
      if (cols.length >= 3) lines.push(cols.join(' | '));
    }
    return lines;
  }

  /* ------------------------------------------------------------------ */
  /*  package.json                                                      */
  /* ------------------------------------------------------------------ */

  private checkPackageJson(
    pkgPath: string,
    content: string,
  ): { issues: ConsistencyIssue[]; repaired: boolean; content: string } {
    const issues: ConsistencyIssue[] = [];
    let repaired = false;
    let c = content;

    try {
      const pkg = JSON.parse(c);
      const slug = this.ctx.projectSlug;

      if (typeof pkg.name === 'string' && pkg.name !== slug) {
        issues.push({
          rule: 'package_name_mismatch',
          severity: 'error',
          file: pkgPath,
          message: `package.json name is "${pkg.name}" but expected "${slug}"`,
        });
        pkg.name = slug;
        repaired = true;
        c = JSON.stringify(pkg, null, 2) + '\n';
      }
    } catch {
      issues.push({
        rule: 'package_json_invalid',
        severity: 'error',
        file: pkgPath,
        message: 'package.json is not valid JSON — will not auto-repair',
      });
    }

    return { issues, repaired, content: c };
  }

  /* ------------------------------------------------------------------ */
  /*  Metadata (layout.tsx)                                             */
  /* ------------------------------------------------------------------ */

  private checkMetadata(
    filePath: string,
    content: string,
  ): { issues: ConsistencyIssue[]; repaired: boolean; content: string } {
    const issues: ConsistencyIssue[] = [];
    let repaired = false;
    let c = content;
    const name = this.ctx.projectName;

    const titleMatch = c.match(/title:\s*['"]([^'"]+)['"]/);
    if (titleMatch && titleMatch[1] !== name) {
      issues.push({
        rule: 'metadata_title_mismatch',
        severity: 'error',
        file: filePath,
        message: `metadata.title is "${titleMatch[1]}" but project name is "${name}"`,
      });
      c = c.replace(/title:\s*['"][^'"]+['"]/, `title: '${name}'`);
      repaired = true;
    }

    const ogMatch = c.match(/openGraph:\s*\{[^}]*title:\s*['"]([^'"]+)['"]/s);
    if (ogMatch && ogMatch[1] !== name) {
      issues.push({
        rule: 'opengraph_title_mismatch',
        severity: 'warning',
        file: filePath,
        message: 'openGraph.title does not match project name',
      });
      c = c.replace(
        /(openGraph:\s*\{[^}]*)title:\s*['"][^'"]+['"]/,
        `$1title: '${name}'`,
      );
      repaired = true;
    }

    return { issues, repaired, content: c };
  }

  /* ------------------------------------------------------------------ */
  /*  Inline APP constants                                              */
  /* ------------------------------------------------------------------ */

  private checkAppData(
    filePath: string,
    content: string,
  ): { issues: ConsistencyIssue[]; repaired: boolean; content: string } {
    const issues: ConsistencyIssue[] = [];
    let repaired = false;
    let c = content;
    const name = this.ctx.projectName;

    const blockMatch = c.match(/(?:const|let|var)\s+APP\s*:\s*\w+\s*=\s*(\{[\s\S]*?\});/);
    if (!blockMatch) return { issues, repaired, content: c };

    const block = blockMatch[1]!;
    const nameMatch = block.match(/"name"\s*:\s*"([^"]+)"/);
    if (nameMatch && nameMatch[1] !== name) {
      issues.push({
        rule: 'app_name_mismatch',
        severity: 'error',
        file: filePath,
        message: `APP.name is "${nameMatch[1]}" but project name is "${name}"`,
      });
      c = c.replace(/"name"\s*:\s*"[^"]+"/, `"name": "${name}"`);
      repaired = true;
    }

    return { issues, repaired, content: c };
  }

  /* ------------------------------------------------------------------ */
  /*  Generic pattern scans                                             */
  /* ------------------------------------------------------------------ */

  private scanPatterns(
    filePath: string,
    content: string,
    patterns: Array<{ pattern: RegExp; label: string }>,
    kind: string,
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];
    const lines = content.split('\n');
    for (const [i, line] of lines.entries()) {
      for (const { pattern, label } of patterns) {
        if (pattern.test(line)) {
          issues.push({
            rule: label,
            severity: 'warning',
            file: filePath,
            message: `[${kind}] Line ${i + 1}: ${line.trim().slice(0, 80)}`,
          });
        }
      }
    }
    return issues;
  }

  /* ------------------------------------------------------------------ */
  /*  Stale project-name contamination                                  */
  /* ------------------------------------------------------------------ */

  private scanStaleNames(
    filePath: string,
    content: string,
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];
    const canonicalLower = this.ctx.projectName.toLowerCase();
    const slugLower = this.ctx.projectSlug.toLowerCase();

    const nameRe = /(?:name|title|projectName|project_name)\s*[=:]\s*['"]([^'"]+)['"]/gi;
    let m: RegExpExecArray | null;
    while ((m = nameRe.exec(content)) !== null) {
      const v = m[1]!.toLowerCase();
      if (v !== canonicalLower && v !== slugLower && v.length > 2 && !GENERIC_WORDS.has(v)) {
        issues.push({
          rule: 'stale_project_name',
          severity: 'error',
          file: filePath,
          message: `Name assignment "${m[1]}" does not match project name "${this.ctx.projectName}"`,
        });
      }
    }

    for (const h1 of content.matchAll(/^#\s+(.+)$/gm)) {
      const t = h1[1]!.trim().toLowerCase();
      if (t !== canonicalLower && t !== slugLower && !GENERIC_WORDS.has(t)) {
        issues.push({
          rule: 'stale_project_name',
          severity: 'warning',
          file: filePath,
          message: `H1 "# ${h1[1]!.trim()}" does not match project name`,
        });
      }
    }

    return issues;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function runConsistencyScan(
  files: Array<{ path: string; content: string }>,
  ctx: ScanContext,
): ConsistencyResult {
  return new GenerationConsistencyScanner(ctx).scan(files);
}
