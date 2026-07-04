import type { AgentManifest, AgentRegistration } from './agent-manifest.js';
import { AgentManifestSchema } from './agent-manifest.js';

export interface AgentRecord {
  manifest: AgentManifest;
  endpoint: string;
  registered_at: string;
  last_heartbeat: string | null;
  status: 'active' | 'idle' | 'draining' | 'failed';
}

export class AgentRegistry {
  private agents: Map<string, AgentRecord> = new Map();

  register(registration: AgentRegistration): AgentRecord {
    const parsed = AgentManifestSchema.parse(registration.manifest);
    const now = new Date().toISOString();

    const record: AgentRecord = {
      manifest: parsed,
      endpoint: registration.endpoint,
      registered_at: now,
      last_heartbeat: now,
      status: 'active',
    };

    this.agents.set(parsed.agent_id, record);
    return record;
  }

  unregister(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  findById(agentId: string): AgentRecord | null {
    return this.agents.get(agentId) ?? null;
  }

  findByType(agentType: string): AgentRecord[] {
    return Array.from(this.agents.values()).filter((a) => a.manifest.agent_type === agentType && a.status === 'active');
  }

  findByCapability(capabilityId: string): AgentRecord[] {
    return Array.from(this.agents.values()).filter((a) =>
      a.manifest.capabilities.some((c) => c.capability_id === capabilityId),
    );
  }

  findByTaskType(taskType: string): AgentRecord[] {
    return Array.from(this.agents.values()).filter((a) =>
      a.manifest.accepted_tasks.includes(taskType as (typeof a.manifest.accepted_tasks)[number]),
    );
  }

  findAvailable(taskType: string): AgentRecord | null {
    const candidates = this.findByTaskType(taskType).filter((a) => a.status === 'active');
    if (candidates.length === 0) return null;

    // Round-robin: pick the one with the oldest last_heartbeat
    return candidates.sort(
      (a, b) => new Date(a.last_heartbeat ?? 0).getTime() - new Date(b.last_heartbeat ?? 0).getTime(),
    )[0]!;
  }

  heartbeat(agentId: string): void {
    const record = this.agents.get(agentId);
    if (record) {
      record.last_heartbeat = new Date().toISOString();
    }
  }

  setStatus(agentId: string, status: AgentRecord['status']): void {
    const record = this.agents.get(agentId);
    if (record) {
      record.status = status;
    }
  }

  listAgents(): AgentRecord[] {
    return Array.from(this.agents.values());
  }

  count(): number {
    return this.agents.size;
  }
}
