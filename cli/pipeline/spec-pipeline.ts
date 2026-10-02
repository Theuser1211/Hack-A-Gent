export enum SpecPipelineStage {
  ChallengeAnalysis = 'challenge_analysis',
  ChallengeValidation = 'challenge_validation',
  DynamicInterview = 'dynamic_interview',
  WinningStrategy = 'winning_strategy',
  ProjectGeneration = 'project_generation',
  AutoRepair = 'auto_repair',
  RuntimeValidation = 'runtime_validation',
  BrowserValidation = 'browser_validation',
  InternalJudge = 'internal_judge',
  ImprovementPass = 'improvement_pass',
  SubmissionPackage = 'submission_package',
}

export const SPEC_PIPELINE_ORDER: SpecPipelineStage[] = [
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

export interface PipelineConfig {
  enabledStages: Set<SpecPipelineStage>;
}

export function defaultPipelineConfig(): PipelineConfig {
  return {
    enabledStages: new Set(SPEC_PIPELINE_ORDER),
  };
}

export class SpecPipeline {
  getOrder(): SpecPipelineStage[] {
    return [...SPEC_PIPELINE_ORDER];
  }

  getIndex(stage: SpecPipelineStage): number {
    const idx = SPEC_PIPELINE_ORDER.indexOf(stage);
    if (idx === -1) throw new Error(`Unknown pipeline stage: ${stage}`);
    return idx;
  }

  isBefore(a: SpecPipelineStage, b: SpecPipelineStage): boolean {
    return this.getIndex(a) < this.getIndex(b);
  }

  missingStages(completed: SpecPipelineStage[]): SpecPipelineStage[] {
    const completedSet = new Set(completed);
    return SPEC_PIPELINE_ORDER.filter(s => !completedSet.has(s));
  }

  nextStage(completed: SpecPipelineStage[]): SpecPipelineStage | null {
    const missing = this.missingStages(completed);
    return missing.length > 0 ? missing[0]! : null;
  }
}
