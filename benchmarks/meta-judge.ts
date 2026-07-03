import type { JudgeIdentity } from './judge-identity.js';

export interface MetaJudge {
  id: string;
  seed: number;
  auditJudge(identity: JudgeIdentity): void;
}
