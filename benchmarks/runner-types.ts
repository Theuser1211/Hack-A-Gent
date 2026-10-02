import type { RepairStrategy } from '../kernel/builders/code-repair-provider.js';
import type { ModuleDiff } from '../kernel/builders/repository-types.js';

export interface RepairRecord {
  attempt: number;
  trigger_phase: string;
  trigger_reason: string;
  modules_regenerated: string[];
  modules_repaired: string[];
  files_repaired: string[];
  files_replaced: number;
  diffs: ModuleDiff[];
  strategy_used: RepairStrategy;
  success: boolean;
}
