/**
 * Code Quality Validator
 *
 * Validates generated code against common LLM output patterns
 * before writing files. Catches issues that would cause build failures.
 */

export interface ValidationIssue {
  file: string;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  line?: number;
  fix?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  fixedFiles: Array<{ path: string; content: string }>;
}

/**
 * Rules for validating generated code.
 */
const VALIDATION_RULES: Array<{
  name: string;
  pattern: RegExp;
  severity: 'error' | 'warning';
  message: string;
  fix?: (content: string) => string;
}> = [
  // React/Next.js rules
  {
    name: 'named-export-page',
    pattern: /export\s+(?:const|let|var|function)\s+Page\b/,
    severity: 'error',
    message: 'Page components must use "export default" — named exports break Next.js App Router',
    fix: (c) => c.replace(/export\s+(?:const|let|var|function)\s+Page\b/, 'export default function Page'),
  },
  {
    name: 'named-export-layout',
    pattern: /export\s+(?:const|let|var|function)\s+Layout\b/,
    severity: 'error',
    message: 'Layout components must use "export default"',
    fix: (c) => c.replace(/export\s+(?:const|let|var|function)\s+Layout\b/, 'export default function Layout'),
  },
  {
    name: 'missing-children-type',
    pattern: /(?:function|const)\s+\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{[^}]*children(?![\s\S]*React\.ReactNode)/,
    severity: 'warning',
    message: 'Components with children prop should type it as React.ReactNode',
  },
  {
    name: 'import-from-types-file',
    pattern: /import\s+\{[^}]+\}\s+from\s+['"]@\/types\//,
    severity: 'warning',
    message: 'Avoid separate type files — define types inline to prevent import resolution failures',
  },

  // Package.json rules
  {
    name: 'missing-react-types',
    pattern: /"dependencies"[\s\S]*"react"[\s\S]*?"@types\/react"/,
    severity: 'error',
    message: 'Missing @types/react in dependencies — TypeScript will fail',
    fix: (c) => {
      const pkg = JSON.parse(c);
      if (!pkg.devDependencies) pkg.devDependencies = {};
      pkg.devDependencies['@types/react'] = '^18.3.3';
      pkg.devDependencies['@types/node'] = '^20.14.0';
      return JSON.stringify(pkg, null, 2);
    },
  },

  // Import resolution rules
  {
    name: 'missing-config-import',
    pattern: /import\s+.*from\s+['"]@\/config['"]/,
    severity: 'error',
    message: 'Importing from @/config but src/config.ts may not exist — ensure it is generated',
  },
  {
    name: 'relative-import-up',
    pattern: /import\s+.*from\s+['"]\.\.\/\.\.\//,
    severity: 'warning',
    message: 'Deep relative imports (../../) are fragile — use @/ alias instead',
  },

  // Common LLM mistakes
  {
    name: 'jsx-in-ts-file',
    pattern: /(?:return|=>)\s*<[A-Z]/,
    severity: 'error',
    message: 'JSX detected in .ts file — rename to .tsx',
  },
  {
    name: 'server-component-client-hook',
    pattern: /(?:useState|useEffect|useCallback|useMemo|useRef)\s*\(/,
    severity: 'error',
    message: 'Client hooks detected — ensure file has "use client" directive at top',
    fix: (c) => {
      if (c.includes('"use client"') || c.includes("'use client'")) return c;
      return `"use client";\n\n${c}`;
    },
  },
  {
    name: 'async-server-component',
    pattern: /(?:export\s+default\s+)?(?:async\s+function|const)\s+\w+Page/,
    severity: 'warning',
    message: 'Server components can be async but ensure no client hooks in same file',
  },
];

/**
 * Validate a single file.
 */
export function validateFile(filePath: string, content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split('\n');

  for (const rule of VALIDATION_RULES) {
    // Check line-by-line for line-specific rules
    if (rule.name === 'named-export-page' || rule.name === 'named-export-layout') {
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i]!)) {
          issues.push({
            file: filePath,
            severity: rule.severity,
            rule: rule.name,
            message: rule.message,
            line: i + 1,
          });
        }
      }
    } else {
      // Check whole content for file-level rules
      if (rule.pattern.test(content)) {
        issues.push({
          file: filePath,
          severity: rule.severity,
          rule: rule.name,
          message: rule.message,
        });
      }
    }
  }

  return issues;
}

/**
 * Auto-fix issues where possible.
 */
export function autoFixIssues(filePath: string, content: string): string {
  let fixed = content;

  for (const rule of VALIDATION_RULES) {
    if (rule.fix && rule.pattern.test(fixed)) {
      fixed = rule.fix(fixed);
    }
  }

  return fixed;
}

/**
 * Validate all files in a generated project.
 */
export function validateGeneratedFiles(
  files: Array<{ path: string; content: string }>,
): ValidationResult {
  const allIssues: ValidationIssue[] = [];
  const fixedFiles: Array<{ path: string; content: string }> = [];

  for (const file of files) {
    // Validate
    const issues = validateFile(file.path, file.content);
    allIssues.push(...issues);

    // Auto-fix what we can
    const fixedContent = autoFixIssues(file.path, file.content);
    fixedFiles.push({ path: file.path, content: fixedContent });
  }

  const errors = allIssues.filter(i => i.severity === 'error');
  const valid = errors.length === 0;

  return { valid, issues: allIssues, fixedFiles };
}

/**
 * Format validation result for CLI display.
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];
  const icon = result.valid ? '✅' : '⚠️';

  lines.push(`${icon} Code Validation: ${result.valid ? 'PASSED' : 'ISSUES FOUND'}`);

  if (result.issues.length > 0) {
    const errors = result.issues.filter(i => i.severity === 'error');
    const warnings = result.issues.filter(i => i.severity === 'warning');

    if (errors.length > 0) {
      lines.push(`   Errors (${errors.length}):`);
      for (const e of errors.slice(0, 10)) {
        lines.push(`     ✗ ${e.file}: ${e.message}`);
      }
    }

    if (warnings.length > 0) {
      lines.push(`   Warnings (${warnings.length}):`);
      for (const w of warnings.slice(0, 10)) {
        lines.push(`     ⚠ ${w.file}: ${w.message}`);
      }
    }
  }

  return lines.join('\n');
}
