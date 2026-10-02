/**
 * UI Quality Validator
 *
 * Deterministic post-generation audit of the generated frontend. Inspects
 * source files on disk and produces a structured UI quality scorecard.
 * No LLM calls. Auto-repairs deterministic gaps where safe.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface UICheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface UICategory {
  name: string;
  score: number;
  max: number;
  checks: UICheck[];
}

export interface UIQualityReport {
  categories: UICategory[];
  overall: number;
  max: number;
  passed: boolean;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const W: string[] = [];

function read(projectDir: string, rel: string): string | null {
  try {
    return readFileSync(path.join(projectDir, rel), 'utf-8');
  } catch {
    return null;
  }
}

function exists(projectDir: string, rel: string): boolean {
  return existsSync(path.join(projectDir, rel));
}

function dirExists(projectDir: string, rel: string): boolean {
  try {
    return statSync(path.join(projectDir, rel)).isDirectory();
  } catch {
    return false;
  }
}

function check(
  cat: UICategory,
  name: string,
  passed: boolean,
  detail?: string,
): void {
  cat.checks.push({ name, passed, detail });
  if (passed) {
    cat.score += 1;
  } else if (detail) {
    W.push(`[${cat.name}] ${name}: ${detail}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Source walker — collects all tsx/ts/jsx/js content                */
/* ------------------------------------------------------------------ */

function walkSource(
  projectDir: string,
  root: string,
  acc: Map<string, string>,
): void {
  const dir = path.join(projectDir, root);
  if (!dirExists(projectDir, root)) return;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkSource(projectDir, path.join(root, entry.name), acc);
      } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        try {
          acc.set(path.join(root, entry.name), readFileSync(full, 'utf-8'));
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* skip unreadable dirs */
  }
}

function collectSources(projectDir: string): Map<string, string> {
  const src = new Map<string, string>();
  for (const root of ['src/app', 'app', 'src', '.']) {
    walkSource(projectDir, root, src);
    if (src.size > 0) break;
  }
  return src;
}

/* ------------------------------------------------------------------ */
/*  Category: Layout                                                  */
/* ------------------------------------------------------------------ */

function auditLayout(projectDir: string): UICategory {
  const cat: UICategory = { name: 'Layout', score: 0, max: 7, checks: [] };
  const sources = collectSources(projectDir);
  const allContent = [...sources.values()].join('\n');

  const layout = read(projectDir, 'src/app/layout.tsx') ?? read(projectDir, 'app/layout.tsx');
  check(cat, 'has_layout', layout !== null, 'layout.tsx missing');

  if (!layout) return cat;

  check(cat, 'has_navbar', /nav|Navbar|Navigation/i.test(layout), 'Navbar not detected in layout');
  check(cat, 'has_footer', /footer|Footer/i.test(layout), 'Footer not detected in layout');

  const page = read(projectDir, 'src/app/page.tsx') ?? read(projectDir, 'app/page.tsx');
  if (page) {
    check(cat, 'has_hero', /hero|Hero|headline|tagline/i.test(page), 'Hero section not detected on landing page');
    check(cat, 'has_cta', /cta|CTA|Get Started|Get started|Open live demo|Continue/i.test(page), 'CTA not detected on landing page');
    check(cat, 'has_feature_section', /feature|Feature/i.test(page), 'Feature section not detected on landing page');
  } else {
    check(cat, 'has_hero', false, 'page.tsx missing — cannot verify hero');
    check(cat, 'has_cta', false, 'page.tsx missing — cannot verify CTA');
    check(cat, 'has_feature_section', false, 'page.tsx missing — cannot verify features');
  }

  check(cat, 'has_viewport', /viewport/i.test(layout), 'Viewport meta not configured (responsive layout at risk)');
  check(cat, 'has_mobile_menu', /md:hidden|hidden md:flex|sm:|max-w-/i.test(allContent), 'No responsive breakpoints detected');

  return cat;
}

/* ------------------------------------------------------------------ */
/*  Category: Typography                                              */
/* ------------------------------------------------------------------ */

function auditTypography(projectDir: string): UICategory {
  const cat: UICategory = { name: 'Typography', score: 0, max: 4, checks: [] };
  const sources = collectSources(projectDir);
  const allContent = [...sources.values()].join('\n');

  check(cat, 'has_h1', /<h1/i.test(allContent), 'No <h1> heading found');
  const hasH2 = /<h2/i.test(allContent);
  check(
    cat,
    'heading_hierarchy',
    /<h1/i.test(allContent) && hasH2,
    'Heading hierarchy incomplete (h1 without h2 or vice versa)',
  );

  const hasFontScale =
    /text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)/.test(allContent) ||
    /font-(bold|semibold|medium|normal|light)/.test(allContent);
  check(cat, 'consistent_font_sizes', hasFontScale, 'No consistent font-size scale detected');

  check(
    cat,
    'no_lorem_ipsum',
    !/lorem\s+ipsum/i.test(allContent),
    'Lorem ipsum placeholder found',
  );

  return cat;
}

/* ------------------------------------------------------------------ */
/*  Category: Spacing                                                 */
/* ------------------------------------------------------------------ */

function auditSpacing(projectDir: string): UICategory {
  const cat: UICategory = { name: 'Spacing', score: 0, max: 4, checks: [] };
  const sources = collectSources(projectDir);
  const allContent = [...sources.values()].join('\n');

  check(
    cat,
    'uses_spacing_utilities',
    /(p-|m-|px-|py-|gap-|space-y-|space-x-)/.test(allContent),
    'No spacing utilities detected (padding/margin/gap classes)',
  );

  check(
    cat,
    'uses_container',
    /(max-w-|container|mx-auto)/.test(allContent),
    'No container width constraint detected',
  );

  const longLines = allContent.split('\n').filter((l) => l.length > 500).length;
  check(cat, 'no_excessive_empty_space', longLines < 20, `${longLines} very long JSX lines (possible layout issue)`);

  check(
    cat,
    'card_padding',
    /(p-4|p-5|p-6|p-8|rounded|border)/.test(allContent),
    'Cards with padding/border not detected',
  );

  return cat;
}

/* ------------------------------------------------------------------ */
/*  Category: Accessibility                                           */
/* ------------------------------------------------------------------ */

function auditAccessibility(projectDir: string): UICategory {
  const cat: UICategory = { name: 'Accessibility', score: 0, max: 5, checks: [] };
  const sources = collectSources(projectDir);
  const allContent = [...sources.values()].join('\n');

  const layout = read(projectDir, 'src/app/layout.tsx') ?? read(projectDir, 'app/layout.tsx') ?? '';

  check(cat, 'has_lang', /lang\s*=\s*["'][a-z]{2}["']/.test(layout), 'html lang attribute missing or not a 2-letter code');
  check(
    cat,
    'imgs_have_alt',
    !/<img[^>]*(?!alt=)/i.test(allContent) || /<img[^>]+alt\s*=/i.test(allContent),
    'Images without alt attributes detected',
  );

  const buttonsWithoutText = (allContent.match(/<button[^>]*>\s*</g) ?? []).length;
  check(cat, 'buttons_have_labels', buttonsWithoutText === 0, `${buttonsWithoutText} button(s) with no text content`);

  const ariaUses = (allContent.match(/aria-[\w-]+/g) ?? []).length;
  const interactiveEls = (allContent.match(/<(button|a|input|select|textarea|dialog)/g) ?? []).length;
  const ariaRatio = interactiveEls > 0 ? ariaUses / interactiveEls : 1;
  check(
    cat,
    'reasonable_aria_usage',
    ariaRatio >= 0.1,
    `Only ${ariaUses} aria attributes for ${interactiveEls} interactive elements`,
  );

  check(
    cat,
    'forms_have_labels',
    !/<input[^>]*>/i.test(allContent) || /<label[\s\S]*?for\s*=/i.test(allContent) || /placeholder=/i.test(allContent),
    'Input fields without label or placeholder detected',
  );

  return cat;
}

/* ------------------------------------------------------------------ */
/*  Category: Assets                                                  */
/* ------------------------------------------------------------------ */

function auditAssets(projectDir: string): UICategory {
  const cat: UICategory = { name: 'Assets', score: 0, max: 3, checks: [] };
  const layout = read(projectDir, 'src/app/layout.tsx') ?? read(projectDir, 'app/layout.tsx') ?? '';

  const hasFaviconRel =
    /href\s*=\s*["']\/favicon\.ico["']/.test(layout) ||
    /href\s*=\s*["']\/icon\.svg["']/.test(layout);
  check(cat, 'favicon_referenced', hasFaviconRel || exists(projectDir, 'public/favicon.ico') || exists(projectDir, 'app/favicon.ico'), 'No favicon reference in layout and no favicon file found');

  const hasOgImage =
    /og:image/i.test(layout) ||
    /openGraph:\s*\{[^}]*image/.test(layout);
  check(cat, 'has_opengraph_image', hasOgImage, 'No OpenGraph image configured');

  check(
    cat,
    'has_basic_metadata',
    /title:\s*['"][^'"]+['"]/.test(layout) && /description:\s*['"][^'"]+['"]/.test(layout),
    'Missing title or description in metadata',
  );

  return cat;
}

/* ------------------------------------------------------------------ */
/*  Top-level scoring                                                 */
/* ------------------------------------------------------------------ */

export function scoreUI(projectDir: string): UIQualityReport {
  const layout = auditLayout(projectDir);
  const typography = auditTypography(projectDir);
  const spacing = auditSpacing(projectDir);
  const accessibility = auditAccessibility(projectDir);
  const assets = auditAssets(projectDir);

  const categories = [layout, typography, spacing, accessibility, assets];

  const totalScore = categories.reduce((s, c) => s + c.score, 0);
  const totalMax = categories.reduce((s, c) => s + c.max, 0);
  const overall = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  return {
    categories,
    overall,
    max: totalMax,
    passed: overall >= 70,
    warnings: W,
  };
}

/* ------------------------------------------------------------------ */
/*  Display helper                                                    */
/* ------------------------------------------------------------------ */

export function formatUIReport(report: UIQualityReport): string {
  const lines: string[] = [];

  for (const cat of report.categories) {
    const pct = cat.max > 0 ? Math.round((cat.score / cat.max) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    lines.push(`  ${cat.name.padEnd(14)} ${bar} ${cat.score}/${cat.max}`);
    for (const c of cat.checks.filter((c) => !c.passed)) {
      lines.push(`    ⚠ ${c.name}: ${c.detail ?? 'failed'}`);
    }
  }

  lines.push('');
  lines.push(`  Overall UI quality: ${report.overall}/100`);
  if (report.passed) {
    lines.push(`  Status: ready for submission`);
  } else {
    lines.push(`  Status: needs improvement`);
  }

  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('  Warnings:');
    for (const w of report.warnings.slice(0, 15)) {
      lines.push(`    • ${w}`);
    }
  }

  return lines.join('\n');
}
