import { describe, it, expect } from 'vitest';

import { SpecPipeline, SPEC_PIPELINE_ORDER, SpecPipelineStage } from '../../cli/pipeline/spec-pipeline.js';

describe('SPEC_PIPELINE_ORDER', () => {
  it('has exactly 11 stages', () => {
    expect(SPEC_PIPELINE_ORDER).toHaveLength(11);
  });

  it('starts with ChallengeAnalysis', () => {
    expect(SPEC_PIPELINE_ORDER[0]).toBe(SpecPipelineStage.ChallengeAnalysis);
  });

  it('has ChallengeValidation second', () => {
    expect(SPEC_PIPELINE_ORDER[1]).toBe(SpecPipelineStage.ChallengeValidation);
  });

  it('ends with SubmissionPackage', () => {
    expect(SPEC_PIPELINE_ORDER[10]).toBe(SpecPipelineStage.SubmissionPackage);
  });

  it('has ChallengeValidation after ChallengeAnalysis', () => {
    const ci = SPEC_PIPELINE_ORDER.indexOf(SpecPipelineStage.ChallengeAnalysis);
    const cv = SPEC_PIPELINE_ORDER.indexOf(SpecPipelineStage.ChallengeValidation);
    expect(cv).toBe(ci + 1);
  });

  it('has DynamicInterview after ChallengeValidation', () => {
    const cv = SPEC_PIPELINE_ORDER.indexOf(SpecPipelineStage.ChallengeValidation);
    const di = SPEC_PIPELINE_ORDER.indexOf(SpecPipelineStage.DynamicInterview);
    expect(di).toBe(cv + 1);
  });

  it('has WinningStrategy after DynamicInterview', () => {
    const di = SPEC_PIPELINE_ORDER.indexOf(SpecPipelineStage.DynamicInterview);
    const ws = SPEC_PIPELINE_ORDER.indexOf(SpecPipelineStage.WinningStrategy);
    expect(ws).toBe(di + 1);
  });

  it('has ProjectGeneration after WinningStrategy', () => {
    const ws = SPEC_PIPELINE_ORDER.indexOf(SpecPipelineStage.WinningStrategy);
    const pg = SPEC_PIPELINE_ORDER.indexOf(SpecPipelineStage.ProjectGeneration);
    expect(pg).toBe(ws + 1);
  });

  it('contains all expected stages in order', () => {
    const expected: SpecPipelineStage[] = [
      SpecPipelineStage.ChallengeAnalysis,
      SpecPipelineStage.ChallengeValidation,
      SpecPipelineStage.DynamicInterview,
      SpecPipelineStage.WinningStrategy,
      SpecPipelineStage.ProjectGeneration,
      SpecPipelineStage.AutoRepair,
      SpecPipelineStage.RuntimeValidation,
      SpecPipelineStage.BrowserValidation,
      SpecPipelineStage.InternalJudge,
      SpecPipelineStage.ImprovementPass,
      SpecPipelineStage.SubmissionPackage,
    ];
    expect(SPEC_PIPELINE_ORDER).toEqual(expected);
  });
});

describe('SpecPipeline', () => {
  const pipeline = new SpecPipeline();

  it('getOrder returns a copy of the spec order', () => {
    const order = pipeline.getOrder();
    expect(order).toEqual(SPEC_PIPELINE_ORDER);
    order.pop();
    expect(pipeline.getOrder()).toHaveLength(11);
  });

  it('getIndex returns correct ordinal', () => {
    expect(pipeline.getIndex(SpecPipelineStage.ChallengeAnalysis)).toBe(0);
    expect(pipeline.getIndex(SpecPipelineStage.SubmissionPackage)).toBe(10);
    expect(pipeline.getIndex(SpecPipelineStage.AutoRepair)).toBe(5);
  });

  it('getIndex throws for unknown stage', () => {
    expect(() => pipeline.getIndex('unknown' as SpecPipelineStage)).toThrow('Unknown pipeline stage');
  });

  it('isBefore returns true when a precedes b', () => {
    expect(pipeline.isBefore(SpecPipelineStage.ChallengeAnalysis, SpecPipelineStage.ChallengeValidation)).toBe(true);
    expect(pipeline.isBefore(SpecPipelineStage.AutoRepair, SpecPipelineStage.BrowserValidation)).toBe(true);
  });

  it('isBefore returns false when a follows b', () => {
    expect(pipeline.isBefore(SpecPipelineStage.SubmissionPackage, SpecPipelineStage.ChallengeAnalysis)).toBe(false);
    expect(pipeline.isBefore(SpecPipelineStage.InternalJudge, SpecPipelineStage.AutoRepair)).toBe(false);
  });

  it('missingStages returns stages not in completed list', () => {
    const missing = pipeline.missingStages([SpecPipelineStage.ChallengeAnalysis, SpecPipelineStage.ChallengeValidation, SpecPipelineStage.DynamicInterview]);
    expect(missing).toHaveLength(8);
    expect(missing[0]).toBe(SpecPipelineStage.WinningStrategy);
    expect(missing).not.toContain(SpecPipelineStage.ChallengeAnalysis);
    expect(missing).not.toContain(SpecPipelineStage.DynamicInterview);
  });

  it('missingStages returns all stages when none completed', () => {
    const missing = pipeline.missingStages([]);
    expect(missing).toHaveLength(11);
    expect(missing).toEqual(SPEC_PIPELINE_ORDER);
  });

  it('missingStages returns empty when all completed', () => {
    const missing = pipeline.missingStages([...SPEC_PIPELINE_ORDER]);
    expect(missing).toHaveLength(0);
  });

  it('nextStage returns the first uncompleted stage', () => {
    expect(pipeline.nextStage([])).toBe(SpecPipelineStage.ChallengeAnalysis);
    expect(pipeline.nextStage([SpecPipelineStage.ChallengeAnalysis])).toBe(SpecPipelineStage.ChallengeValidation);
    expect(pipeline.nextStage(SPEC_PIPELINE_ORDER.slice(0, 6))).toBe(SpecPipelineStage.RuntimeValidation);
  });

  it('nextStage returns null when all stages completed', () => {
    expect(pipeline.nextStage([...SPEC_PIPELINE_ORDER])).toBeNull();
  });
});
