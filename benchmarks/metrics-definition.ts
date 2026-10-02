export type MetricFormula = string;
export type NormalizationRule = 'none' | 'min_max' | 'z_score' | 'rank' | 'percentile';

export interface MetricInputDependency {
  variable: string;
  source: string;
  description: string;
}

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  formula: MetricFormula;
  formulaDescription: string;
  range: [number, number];
  higherIsBetter: boolean;
  inputDependencies: MetricInputDependency[];
  normalizationRule: NormalizationRule;
}

export const METRICS_REGISTRY: Record<string, MetricDefinition> = {
  robustness_score: {
    id: 'robustness_score',
    name: 'Robustness Score',
    description: 'Overall measure of agent ability to withstand and recover from mutations',
    formula: '0.4 * correctness + 0.3 * detection_accuracy + 0.3 * repair_success_rate',
    formulaDescription:
      'Weighted combination of build correctness, mutation detection accuracy, and repair success rate. All components normalized to [0,100].',
    range: [0, 100],
    higherIsBetter: true,
    inputDependencies: [
      { variable: 'correctness', source: 'build_verification', description: 'Build verification pass rate (0-100)' },
      { variable: 'detection_accuracy', source: 'mutation_analysis', description: 'Rate of mutation detection (0-1)' },
      { variable: 'repair_success_rate', source: 'repair_phase', description: 'Rate of successful repairs (0-1)' },
    ],
    normalizationRule: 'min_max',
  },

  mutation_survival_rate: {
    id: 'mutation_survival_rate',
    name: 'Mutation Survival Rate',
    description: 'Proportion of mutations that the agent survives without catastrophic failure',
    formula: 'survived_mutations / total_mutations_applied',
    formulaDescription: "Ratio of mutations where the agent's build remains functional after mutation application.",
    range: [0, 1],
    higherIsBetter: true,
    inputDependencies: [
      {
        variable: 'survived_mutations',
        source: 'mutation_analysis',
        description: 'Count of mutations that did not cause failure',
      },
      { variable: 'total_mutations_applied', source: 'mutation_analysis', description: 'Total mutations applied' },
    ],
    normalizationRule: 'none',
  },

  repair_efficiency: {
    id: 'repair_efficiency',
    name: 'Repair Efficiency',
    description: 'Agent effectiveness at repairing mutation-induced defects',
    formula: 'successful_repairs / total_repair_attempts',
    formulaDescription: 'Ratio of repair attempts that result in a passing build verification.',
    range: [0, 1],
    higherIsBetter: true,
    inputDependencies: [
      {
        variable: 'successful_repairs',
        source: 'repair_phase',
        description: 'Repair attempts that passed verification',
      },
      { variable: 'total_repair_attempts', source: 'repair_phase', description: 'Total repair attempts made' },
    ],
    normalizationRule: 'none',
  },

  detection_accuracy: {
    id: 'detection_accuracy',
    name: 'Detection Accuracy',
    description: 'Agent ability to correctly identify applied mutations',
    formula: 'correctly_detected_mutations / total_mutations_applied',
    formulaDescription: 'Ratio of mutations that the agent correctly identifies as anomalies during verification.',
    range: [0, 1],
    higherIsBetter: true,
    inputDependencies: [
      {
        variable: 'correctly_detected_mutations',
        source: 'mutation_analysis',
        description: 'Mutations detected by verification',
      },
      { variable: 'total_mutations_applied', source: 'mutation_analysis', description: 'Total mutations applied' },
    ],
    normalizationRule: 'none',
  },

  mutation_differentiation_index: {
    id: 'mutation_differentiation_index',
    name: 'Mutation Differentiation Index',
    description: 'How well mutations separate strong vs weak agents',
    formula: '|ÃŽÂ¼_weak_detection - ÃŽÂ¼_strong_detection|',
    formulaDescription:
      'Absolute difference in detection rates between weak agents (bottom quartile) and strong agents (top quartile). Higher values indicate better differentiation.',
    range: [0, 1],
    higherIsBetter: true,
    inputDependencies: [
      {
        variable: 'ÃŽÂ¼_weak_detection',
        source: 'agent_analysis',
        description: 'Mean detection rate of bottom-quartile agents',
      },
      {
        variable: 'ÃŽÂ¼_strong_detection',
        source: 'agent_analysis',
        description: 'Mean detection rate of top-quartile agents',
      },
    ],
    normalizationRule: 'none',
  },

  agent_specialization_index: {
    id: 'agent_specialization_index',
    name: 'Agent Specialization Index',
    description: 'Degree to which agents develop specialized robustness profiles',
    formula: 'ÃÆ’(per_mutation_type_performance) / ÃŽÂ¼(per_mutation_type_performance)',
    formulaDescription:
      'Coefficient of variation of agent performance across mutation types. Higher values indicate more specialized agents.',
    range: [0, 1],
    higherIsBetter: true,
    inputDependencies: [
      {
        variable: 'per_mutation_type_performance',
        source: 'agent_profile',
        description: 'Agent performance scores per mutation type',
      },
    ],
    normalizationRule: 'min_max',
  },

  mutation_evolution_velocity: {
    id: 'mutation_evolution_velocity',
    name: 'Mutation Evolution Velocity',
    description: 'Rate at which the mutation population evolves and discovers new variants',
    formula: '(N_new_mutations + N_crossover_offspring) / N_total_mutations * ÃŽâ€generations',
    formulaDescription:
      'Combined rate of new mutation discovery through crossover and variant spawning, normalized by total population size and generation count.',
    range: [0, 1],
    higherIsBetter: false,
    inputDependencies: [
      {
        variable: 'N_new_mutations',
        source: 'mutation_genome',
        description: 'Number of newly spawned mutation variants',
      },
      { variable: 'N_crossover_offspring', source: 'mutation_genome', description: 'Number of crossover offspring' },
      { variable: 'N_total_mutations', source: 'mutation_genome', description: 'Total mutation population size' },
      { variable: 'ÃŽâ€generations', source: 'mutation_genome', description: 'Number of generations elapsed' },
    ],
    normalizationRule: 'min_max',
  },

  leaderboard_stability_index: {
    id: 'leaderboard_stability_index',
    name: 'Leaderboard Stability Index',
    description: 'Stability of agent rankings across consecutive evaluation rounds',
    formula: '1 - (ÃŽÂ£|rank_t - rank_{ t-1 }|) / (N_agents * max_rank_shift)',
    formulaDescription:
      'Inverse of the average rank displacement across consecutive rounds. 1 = perfectly stable rankings, 0 = completely shuffled.',
    range: [0, 1],
    higherIsBetter: true,
    inputDependencies: [
      { variable: 'rank_t', source: 'leaderboard', description: 'Agent rank at current time' },
      { variable: 'rank_{ t-1 }', source: 'leaderboard', description: 'Agent rank at previous time' },
      { variable: 'N_agents', source: 'leaderboard', description: 'Total number of agents in leaderboard' },
    ],
    normalizationRule: 'none',
  },

  repair_difficulty_index: {
    id: 'repair_difficulty_index',
    name: 'Repair Difficulty Index',
    description: 'Average difficulty of repairing mutations, measured by repair attempt count and strategy diversity',
    formula: '1 - (avg_repair_attempts / max_repair_limit) * (unique_strategies / max_strategies)',
    formulaDescription:
      'Composite of average repair attempts needed and diversity of repair strategies used. Higher values indicate more difficult mutations.',
    range: [0, 1],
    higherIsBetter: false,
    inputDependencies: [
      { variable: 'avg_repair_attempts', source: 'repair_phase', description: 'Average repair attempts per mutation' },
      {
        variable: 'unique_strategies',
        source: 'repair_phase',
        description: 'Number of distinct repair strategies used',
      },
    ],
    normalizationRule: 'none',
  },

  failure_consistency_score: {
    id: 'failure_consistency_score',
    name: 'Failure Consistency Score',
    description: 'How consistently mutations cause failures across different agents',
    formula: '1 - ÃÆ’(failure_rates)',
    formulaDescription:
      'One minus the standard deviation of failure rates across agents. Higher values mean mutations consistently fail all agents (or succeed for all).',
    range: [0, 1],
    higherIsBetter: false,
    inputDependencies: [
      {
        variable: 'failure_rates',
        source: 'agent_analysis',
        description: 'Failure rates per agent for a given mutation',
      },
    ],
    normalizationRule: 'none',
  },
};

export function getMetricDefinition(metricId: string): MetricDefinition | undefined {
  return METRICS_REGISTRY[metricId];
}

export function getAllMetricDefinitions(): MetricDefinition[] {
  return Object.values(METRICS_REGISTRY);
}

export function normalizeMetricValue(value: number, def: MetricDefinition): number {
  const [min, max] = def.range;
  switch (def.normalizationRule) {
    case 'min_max':
      if (max - min === 0) return 0.5;
      return (value - min) / (max - min);
    case 'z_score':
      return value;
    case 'rank':
      return value;
    case 'percentile':
      return value / 100;
    case 'none':
    default:
      return value;
  }
}

export function computeMetric(def: MetricDefinition, inputValues: Record<string, number>): number {
  const vars = { ...inputValues };
  const expression = def.formula;

  try {
    const result = new Function(...Object.keys(vars), `return ${expression};`)(...Object.values(vars));
    return def.higherIsBetter
      ? Math.max(def.range[0], Math.min(def.range[1], result))
      : Math.max(def.range[0], Math.min(def.range[1], 1 - result));
  } catch {
    return def.range[0];
  }
}
