export type ImprovementActionType =
  | 'add_feature'
  | 'enhance_ui'
  | 'fix_issue'
  | 'add_docs'
  | 'improve_performance'
  | 'add_tests'
  | 'add_deployment';

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ImprovementAction {
  id: string;
  type: ImprovementActionType;
  target: string;
  description: string;
  priority: ActionPriority;
  expectedScoreIncrease: number;
  implementation: string;
}

export interface JudgeResult {
  scores: {
    innovation: number;
    technicalDepth: number;
    feasibility: number;
    presentation: number;
    completeness: number;
    maintainability: number;
    judgeAlignment: number;
    overall: number;
  };
  strengths: string[];
  weaknesses: string[];
}
