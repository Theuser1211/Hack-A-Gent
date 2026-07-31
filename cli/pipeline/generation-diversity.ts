/**
 * Generation Diversity Enforcer
 * 
 * Ensures each generated project is distinct by tracking:
 * - Layout patterns (split-screen, dashboard, step-by-step, etc.)
 * - Color palettes (AI purples, healthcare teal, fintech slate, etc.)
 * - Component patterns (data viz, forms, charts, etc.)
 * - Feature sets (auth, real-time, offline, etc.)
 */

export type LayoutPattern =
  | 'split-screen'
  | 'dashboard'
  | 'step-by-step'
  | 'bento-grid'
  | 'full-screen-demo'
  | 'sidebar-main'
  | 'centered-card'
  | 'multi-column';

export type ColorPalette =
  | 'ai-purple'
  | 'healthcare-teal'
  | 'fintech-slate'
  | 'climate-green'
  | 'gaming-pink'
  | 'developer-mono'
  | 'social-orange'
  | 'minimal-white';

export type ComponentPattern =
  | 'data-visualization'
  | 'interactive-form'
  | 'real-time-feed'
  | 'chart-dashboard'
  | 'step-wizard'
  | 'comparison-table'
  | 'media-gallery'
  | 'chat-interface';

export interface GenerationFingerprint {
  layout: LayoutPattern;
  colorPalette: ColorPalette;
  components: ComponentPattern[];
  features: string[];
}

export interface DiversityCheck {
  similar: boolean;
  conflicts: string[];
  suggestion?: string;
}

const LAYOUT_OPTIONS: LayoutPattern[] = [
  'split-screen',
  'dashboard',
  'step-by-step',
  'bento-grid',
  'full-screen-demo',
  'sidebar-main',
  'centered-card',
  'multi-column',
];

const COLOR_OPTIONS: ColorPalette[] = [
  'ai-purple',
  'healthcare-teal',
  'fintech-slate',
  'climate-green',
  'gaming-pink',
  'developer-mono',
  'social-orange',
  'minimal-white',
];

const COMPONENT_OPTIONS: ComponentPattern[] = [
  'data-visualization',
  'interactive-form',
  'real-time-feed',
  'chart-dashboard',
  'step-wizard',
  'comparison-table',
  'media-gallery',
  'chat-interface',
];

/**
 * Determine the best layout and color palette for a hackathon theme
 */
export function inferThemeStyle(
  theme: string,
  title: string,
): GenerationFingerprint {
  const themeLower = `${theme} ${title}`.toLowerCase();

  let colorPalette: ColorPalette = 'minimal-white';
  if (themeLower.includes('ai') || themeLower.includes('machine learning') || themeLower.includes('ml')) {
    colorPalette = 'ai-purple';
  } else if (themeLower.includes('health') || themeLower.includes('medical') || themeLower.includes('clinic')) {
    colorPalette = 'healthcare-teal';
  } else if (themeLower.includes('financ') || themeLower.includes('bank') || themeLower.includes('payment')) {
    colorPalette = 'fintech-slate';
  } else if (themeLower.includes('climate') || themeLower.includes('green') || themeLower.includes('environ')) {
    colorPalette = 'climate-green';
  } else if (themeLower.includes('game') || themeLower.includes('entertain')) {
    colorPalette = 'gaming-pink';
  } else if (themeLower.includes('developer') || themeLower.includes('code') || themeLower.includes('hack')) {
    colorPalette = 'developer-mono';
  } else if (themeLower.includes('social') || themeLower.includes('communit')) {
    colorPalette = 'social-orange';
  }

  let layout: LayoutPattern = 'dashboard';
  if (themeLower.includes('real-time') || themeLower.includes('live')) {
    layout = 'full-screen-demo';
  } else if (themeLower.includes('data') || themeLower.includes('analytics')) {
    layout = 'chart-dashboard';
  } else if (themeLower.includes('step') || themeLower.includes('process') || themeLower.includes('workflow')) {
    layout = 'step-by-step';
  } else if (themeLower.includes('compare') || themeLower.includes('marketplace')) {
    layout = 'bento-grid';
  } else if (themeLower.includes('dashboard') || themeLower.includes('admin')) {
    layout = 'sidebar-main';
  } else if (themeLower.includes('mobile') || themeLower.includes('app')) {
    layout = 'full-screen-demo';
  } else if (themeLower.includes('presentation') || themeLower.includes('portfolio')) {
    layout = 'split-screen';
  }

  const components: ComponentPattern[] = [];
  if (themeLower.includes('data') || themeLower.includes('metric') || themeLower.includes('analytics')) {
    components.push('chart-dashboard');
    components.push('data-visualization');
  }
  if (themeLower.includes('form') || themeLower.includes('input') || themeLower.includes('submit')) {
    components.push('interactive-form');
  }
  if (themeLower.includes('real-time') || themeLower.includes('live') || themeLower.includes('feed')) {
    components.push('real-time-feed');
  }
  if (themeLower.includes('wizard') || themeLower.includes('onboard')) {
    components.push('step-wizard');
  }
  if (themeLower.includes('chat') || themeLower.includes('message')) {
    components.push('chat-interface');
  }
  if (themeLower.includes('gallery') || themeLower.includes('media') || themeLower.includes('photo')) {
    components.push('media-gallery');
  }
  if (components.length === 0) {
    components.push('data-visualization');
    components.push('interactive-form');
  }

  return { layout, colorPalette, components, features: [] };
}

/**
 * Check if a new fingerprint is too similar to existing ones
 */
export function checkDiversity(
  newFingerprint: GenerationFingerprint,
  existingFingerprints: GenerationFingerprint[],
): DiversityCheck {
  const conflicts: string[] = [];

  for (let i = 0; i < existingFingerprints.length; i++) {
    const existing = existingFingerprints[i];
    const similarities: string[] = [];

    if (existing.layout === newFingerprint.layout) {
      similarities.push('layout');
    }
    if (existing.colorPalette === newFingerprint.colorPalette) {
      similarities.push('color palette');
    }
    const sharedComponents = existing.components.filter(c =>
      newFingerprint.components.includes(c)
    );
    if (sharedComponents.length >= 2) {
      similarities.push(`${sharedComponents.length} components`);
    }

    if (similarities.length >= 2) {
      conflicts.push(`Too similar to project ${i + 1}: shares ${similarities.join(', ')}`);
    }
  }

  if (conflicts.length > 0) {
    const usedLayouts = existingFingerprints.map(f => f.layout);
    const usedColors = existingFingerprints.map(f => f.colorPalette);
    const availableLayout = LAYOUT_OPTIONS.find(l => !usedLayouts.includes(l));
    const availableColor = COLOR_OPTIONS.find(c => !usedColors.includes(c));

    return {
      similar: true,
      conflicts,
      suggestion: `Try layout: ${availableLayout ?? 'step-by-step'}, color: ${availableColor ?? 'gaming-pink'}`,
    };
  }

  return { similar: false, conflicts: [] };
}

/**
 * Suggest diversity improvements for a fingerprint
 */
export function diversify(
  fingerprint: GenerationFingerprint,
  existingFingerprints: GenerationFingerprint[],
): GenerationFingerprint {
  const check = checkDiversity(fingerprint, existingFingerprints);
  if (!check.similar) return fingerprint;

  const usedLayouts = existingFingerprints.map(f => f.layout);
  const usedColors = existingFingerprints.map(f => f.colorPalette);

  const newLayout = LAYOUT_OPTIONS.find(l => !usedLayouts.includes(l)) ?? 'step-by-step';
  const newColor = COLOR_OPTIONS.find(c => !usedColors.includes(c)) ?? 'gaming-pink';

  return {
    ...fingerprint,
    layout: newLayout,
    colorPalette: newColor,
  };
}
