import { describe, it, expect } from 'vitest';

import {
  RepairStateSchema,
  FixTaskSchema,
  RepairConfigSchema,
  RepairIterationSchema,
} from '../../kernel/repair/repair-types.js';

describe('Repair Types', () => {
  describe('RepairStateSchema', () => {
    it('accepts valid states', () => {
      expect(RepairStateSchema.parse('REPAIR_PENDING')).toBe('REPAIR_PENDING');
      expect(RepairStateSchema.parse('REPAIRING')).toBe('REPAIRING');
      expect(RepairStateSchema.parse('RETESTING')).toBe('RETESTING');
      expect(RepairStateSchema.parse('REJUDGING')).toBe('REJUDGING');
      expect(RepairStateSchema.parse('REPAIR_COMPLETED')).toBe('REPAIR_COMPLETED');
      expect(RepairStateSchema.parse('REPAIR_FAILED')).toBe('REPAIR_FAILED');
    });

    it('rejects invalid states', () => {
      expect(() => RepairStateSchema.parse('INVALID')).toThrow();
    });
  });

  describe('FixTaskSchema', () => {
    it('accepts valid fix task', () => {
      const task = FixTaskSchema.parse({
        id: 'fix-001',
        target_file: 'src/app.ts',
        issue: 'Missing error handling',
        severity: 'high',
        recommendation: 'Add try-catch block',
        acceptance_criteria: ['Error handling added'],
        created_at: new Date().toISOString(),
      });
      expect(task.status).toBe('pending');
      expect(task.task_id).toBeNull();
    });

    it('rejects invalid severity', () => {
      expect(() =>
        FixTaskSchema.parse({
          id: 'fix-002',
          target_file: 'src/app.ts',
          issue: 'Bug',
          severity: 'unknown',
          recommendation: 'Fix',
          created_at: new Date().toISOString(),
        }),
      ).toThrow();
    });
  });

  describe('RepairConfigSchema', () => {
    it('accepts default config', () => {
      const config = RepairConfigSchema.parse({});
      expect(config.max_iterations).toBe(3);
      expect(config.retest_after_fix).toBe(true);
      expect(config.rejudge_after_retest).toBe(true);
    });

    it('accepts custom config', () => {
      const config = RepairConfigSchema.parse({ max_iterations: 5, retest_after_fix: false });
      expect(config.max_iterations).toBe(5);
      expect(config.retest_after_fix).toBe(false);
    });
  });

  describe('RepairIterationSchema', () => {
    it('accepts valid iteration', () => {
      const iter = RepairIterationSchema.parse({
        iteration_number: 1,
        state: 'REPAIRING',
        fix_tasks: [],
        started_at: new Date().toISOString(),
      });
      expect(iter.iteration_number).toBe(1);
      expect(iter.summary).toBe('');
    });

    it('accepts completed iteration', () => {
      const iter = RepairIterationSchema.parse({
        iteration_number: 1,
        state: 'REPAIR_COMPLETED',
        fix_tasks: [
          {
            id: 'fix-001',
            target_file: 'src/app.ts',
            issue: 'Bug',
            severity: 'high',
            recommendation: 'Fix',
            created_at: new Date().toISOString(),
          },
        ],
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        summary: 'Done',
      });
      expect(iter.state).toBe('REPAIR_COMPLETED');
      expect(iter.fix_tasks).toHaveLength(1);
    });
  });
});
