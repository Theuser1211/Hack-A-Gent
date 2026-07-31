import { describe, it, expect } from 'vitest';
import {
  inferThemeStyle,
  checkDiversity,
  diversify,
  type GenerationFingerprint,
} from '../../cli/pipeline/generation-diversity.js';

describe('Generation Diversity', () => {
  describe('inferThemeStyle', () => {
    it('infers AI theme', () => {
      const result = inferThemeStyle('AI Hackathon', 'Smart Assistant');
      expect(result.colorPalette).toBe('ai-purple');
      expect(result.components.length).toBeGreaterThan(0);
    });

    it('infers healthcare theme', () => {
      const result = inferThemeStyle('Healthcare Innovation', 'Medical Tracker');
      expect(result.colorPalette).toBe('healthcare-teal');
    });

    it('infers fintech theme', () => {
      const result = inferThemeStyle('FinTech Challenge', 'Payment App');
      expect(result.colorPalette).toBe('fintech-slate');
    });

    it('infers climate theme', () => {
      const result = inferThemeStyle('Climate Action', 'Carbon Calculator');
      expect(result.colorPalette).toBe('climate-green');
    });

    it('infers gaming theme', () => {
      const result = inferThemeStyle('Game Jam', 'Retro Platformer');
      expect(result.colorPalette).toBe('gaming-pink');
    });

    it('infers developer theme', () => {
      const result = inferThemeStyle('Dev Tools Hackathon', 'CLI Builder');
      expect(result.colorPalette).toBe('developer-mono');
    });

    it('infers social theme', () => {
      const result = inferThemeStyle('Social Impact', 'Community Forum');
      expect(result.colorPalette).toBe('social-orange');
    });

    it('uses minimal-white for unknown themes', () => {
      const result = inferThemeStyle('Random Topic', 'Generic Project');
      expect(result.colorPalette).toBe('minimal-white');
    });

    it('infers real-time layout for live data', () => {
      const result = inferThemeStyle('Real-time Data', 'Live Dashboard');
      expect(result.layout).toBe('full-screen-demo');
    });

    it('infers step-by-step layout for workflows', () => {
      const result = inferThemeStyle('Workflow Automation', 'Step Processor');
      expect(result.layout).toBe('step-by-step');
    });
  });

  describe('checkDiversity', () => {
    it('detects no conflict with empty history', () => {
      const fingerprint: GenerationFingerprint = {
        layout: 'dashboard',
        colorPalette: 'ai-purple',
        components: ['chart-dashboard'],
        features: [],
      };
      const result = checkDiversity(fingerprint, []);
      expect(result.similar).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('detects layout and color conflict', () => {
      const existing: GenerationFingerprint[] = [
        { layout: 'dashboard', colorPalette: 'ai-purple', components: ['chart-dashboard'], features: [] },
      ];
      const newFp: GenerationFingerprint = {
        layout: 'dashboard',
        colorPalette: 'ai-purple',
        components: ['interactive-form'],
        features: [],
      };
      const result = checkDiversity(newFp, existing);
      expect(result.similar).toBe(true);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('detects component conflict', () => {
      const existing: GenerationFingerprint[] = [
        { layout: 'dashboard', colorPalette: 'ai-purple', components: ['chart-dashboard', 'data-visualization'], features: [] },
      ];
      const newFp: GenerationFingerprint = {
        layout: 'dashboard',
        colorPalette: 'ai-purple',
        components: ['chart-dashboard', 'data-visualization'],
        features: [],
      };
      const result = checkDiversity(newFp, existing);
      expect(result.similar).toBe(true);
    });

    it('allows similar layout with different color', () => {
      const existing: GenerationFingerprint[] = [
        { layout: 'dashboard', colorPalette: 'ai-purple', components: ['chart-dashboard'], features: [] },
      ];
      const newFp: GenerationFingerprint = {
        layout: 'dashboard',
        colorPalette: 'healthcare-teal',
        components: ['interactive-form'],
        features: [],
      };
      const result = checkDiversity(newFp, existing);
      expect(result.similar).toBe(false);
    });
  });

  describe('diversify', () => {
    it('returns same fingerprint if no conflicts', () => {
      const fp: GenerationFingerprint = {
        layout: 'dashboard',
        colorPalette: 'ai-purple',
        components: ['chart-dashboard'],
        features: [],
      };
      const result = diversify(fp, []);
      expect(result).toEqual(fp);
    });

    it('changes layout and color when conflicted', () => {
      const existing: GenerationFingerprint[] = [
        { layout: 'dashboard', colorPalette: 'ai-purple', components: ['chart-dashboard'], features: [] },
      ];
      const fp: GenerationFingerprint = {
        layout: 'dashboard',
        colorPalette: 'ai-purple',
        components: ['interactive-form'],
        features: [],
      };
      const result = diversify(fp, existing);
      expect(result.layout).not.toBe('dashboard');
      expect(result.colorPalette).not.toBe('ai-purple');
    });
  });
});
