export interface StageGuardResult {
  valid: boolean;
  stage: string;
  error?: string;
}

export function validateStageInput(stage: string, input: Record<string, unknown>): StageGuardResult {
  switch (stage) {
    case 'ChallengeAnalysis': {
      const title = String(input.title ?? '');
      if (!title.trim()) {
        return { valid: false, stage, error: 'Challenge title cannot be empty' };
      }
      return { valid: true, stage };
    }

    case 'ProjectGeneration': {
      const projectName = String(input.projectName ?? '');
      const title = String(input.title ?? '');
      const qualification = String(input.qualification ?? '');

      if (!projectName.trim()) {
        return { valid: false, stage, error: 'Project name cannot be empty' };
      }
      if (!title.trim()) {
        return { valid: false, stage, error: 'Hackathon title cannot be empty' };
      }
      if (qualification === 'UNKNOWN' || qualification === 'UNSUPPORTED') {
        return { valid: false, stage, error: `Cannot start generation with qualification status: ${qualification}` };
      }
      return { valid: true, stage };
    }

    case 'WinningStrategy': {
      const title = String(input.title ?? '');
      const judgingCriteria = input.judgingCriteria as string[] | undefined;

      if (!title.trim()) {
        return { valid: false, stage, error: 'Challenge title cannot be empty for strategy generation' };
      }
      if (!judgingCriteria || judgingCriteria.length === 0) {
        return { valid: false, stage, error: 'Judging criteria cannot be empty for strategy generation' };
      }
      return { valid: true, stage };
    }

    case 'ImprovementPass': {
      const projectName = String(input.projectName ?? '');
      const currentScore = Number(input.currentScore ?? 0);

      if (!projectName.trim()) {
        return { valid: false, stage, error: 'Project name cannot be empty for improvement pass' };
      }
      if (currentScore < 0 || currentScore > 100) {
        return { valid: false, stage, error: `Invalid current score: ${currentScore}` };
      }
      return { valid: true, stage };
    }

    case 'InternalJudge': {
      const projectName = String(input.projectName ?? '');
      if (!projectName.trim()) {
        return { valid: false, stage, error: 'Project name cannot be empty for internal judge' };
      }
      return { valid: true, stage };
    }

    case 'SubmissionPackage': {
      const projectName = String(input.projectName ?? '');
      const judgeScore = Number(input.judgeScore ?? 0);

      if (!projectName.trim()) {
        return { valid: false, stage, error: 'Project name cannot be empty for submission package' };
      }
      if (judgeScore < 50) {
        return { valid: false, stage, error: `Judge score ${judgeScore} below minimum threshold (50)` };
      }
      return { valid: true, stage };
    }

    default:
      return { valid: true, stage };
  }
}
