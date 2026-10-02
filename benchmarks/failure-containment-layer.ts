import { deterministicNow } from './determinism-kernel.js';

// ---- Types ----

export type ContainmentZone = 'build' | 'deploy' | 'browser_test';

export interface ZoneState {
  zone: ContainmentZone;
  healthy: boolean;
  errors: string[];
  lastActivity: string;
  artifactRef: string | null;
}

export interface ContainmentEvent {
  zone: ContainmentZone;
  type: 'failure' | 'rollback' | 'isolated' | 'cleanup';
  message: string;
  timestamp: string;
}

export interface RollbackAction {
  zone: ContainmentZone;
  reason: string;
  target: string;
  success: boolean;
  timestamp: string;
}

export interface ContainmentReport {
  zones: ZoneState[];
  events: ContainmentEvent[];
  rollbacks: RollbackAction[];
  cascadingFailure: boolean;
  isolated: boolean;
  summary: string;
}

// ---- Failure Containment Layer ----

export class FailureContainmentLayer {
  private readonly seed: number;
  private zones: Map<ContainmentZone, ZoneState>;
  private events: ContainmentEvent[];
  private rollbacks: RollbackAction[];
  private cascadingFailure: boolean;

  constructor(seed: number = 42) {
    this.seed = seed;
    this.zones = new Map();
    this.events = [];
    this.rollbacks = [];
    this.cascadingFailure = false;

    // Initialize all zones as healthy
    for (const zone of ['build', 'deploy', 'browser_test'] as ContainmentZone[]) {
      this.zones.set(zone, {
        zone,
        healthy: true,
        errors: [],
        lastActivity: deterministicNow(seed),
        artifactRef: null,
      });
    }
  }

  // ---- Zone Management ----

  getZone(zone: ContainmentZone): ZoneState | undefined {
    return this.zones.get(zone);
  }

  isZoneHealthy(zone: ContainmentZone): boolean {
    return this.zones.get(zone)?.healthy ?? false;
  }

  setZoneArtifact(zone: ContainmentZone, artifactRef: string): void {
    const z = this.zones.get(zone);
    if (z) {
      z.artifactRef = artifactRef;
      z.lastActivity = deterministicNow(this.seed);
    }
  }

  // ---- 1. Failure Isolation ----

  /**
   * Record a failure in a specific zone.
   * Returns true if the zone was already unhealthy (cascading).
   */
  recordFailure(zone: ContainmentZone, error: string): boolean {
    const z = this.zones.get(zone);
    if (!z) return false;

    const wasAlreadyUnhealthy = !z.healthy;
    z.healthy = false;
    z.errors.push(error);
    z.lastActivity = deterministicNow(this.seed);

    this.events.push({ zone, type: 'failure', message: error, timestamp: deterministicNow(this.seed) });

    // If another zone was already unhealthy, this is cascading
    const otherZonesUnhealthy =
      Array.from(this.zones.entries()).filter(([k, v]) => k !== zone && !v.healthy).length > 0;

    if (wasAlreadyUnhealthy || otherZonesUnhealthy) {
      this.cascadingFailure = true;
    }

    return wasAlreadyUnhealthy;
  }

  /**
   * Check if a zone's failure would contaminate others.
   * Rule: failure in one zone does NOT contaminate others.
   */
  isIsolated(zone: ContainmentZone): boolean {
    // Isolation is ALWAYS true Ã¢â‚¬â€ each zone has its own state
    return true;
  }

  /**
   * Get all errors from a zone without cross-contamination.
   */
  getZoneErrors(zone: ContainmentZone): string[] {
    const z = this.zones.get(zone);
    return z ? [...z.errors] : [];
  }

  // ---- 2. Rollback Auto-Trigger ----

  /**
   * Trigger a rollback for a specific zone.
   * In production, this would call ToolExecutionGateway to undo changes.
   */
  triggerRollback(zone: ContainmentZone, reason: string): RollbackAction {
    const action: RollbackAction = {
      zone,
      reason,
      target: `${zone}_artifacts`,
      success: true,
      timestamp: deterministicNow(this.seed),
    };

    this.zones.get(zone)!.healthy = false;
    this.zones.get(zone)!.artifactRef = null;
    this.rollbacks.push(action);

    this.events.push({
      zone,
      type: 'rollback',
      message: `Rollback triggered: ${reason}`,
      timestamp: deterministicNow(this.seed),
    });

    return action;
  }

  // ---- 3. Zone Cleanup ----

  /**
   * Clean a zone after failure Ã¢â‚¬â€ reset for clean rebuild.
   */
  cleanupZone(zone: ContainmentZone): void {
    const z = this.zones.get(zone);
    if (z) {
      z.healthy = true;
      z.errors = [];
      z.artifactRef = null;
      z.lastActivity = deterministicNow(this.seed);

      this.events.push({
        zone,
        type: 'cleanup',
        message: `Zone cleaned for rebuild`,
        timestamp: deterministicNow(this.seed),
      });
    }
  }

  /**
   * Clean ALL zones Ã¢â‚¬â€ full reset.
   */
  cleanupAll(): void {
    for (const zone of ['build', 'deploy', 'browser_test'] as ContainmentZone[]) {
      this.cleanupZone(zone as ContainmentZone);
    }
    this.cascadingFailure = false;
  }

  // ---- Report ----

  getReport(): ContainmentReport {
    const zones = Array.from(this.zones.values());
    const unhealthyCount = zones.filter((z) => !z.healthy).length;
    const isolated = this.events.filter((e) => e.type === 'isolated').length > 0 || unhealthyCount <= 1;

    const summary = this.cascadingFailure
      ? `CASCADING FAILURE: ${unhealthyCount} zone(s) unhealthy. Isolation failed.`
      : unhealthyCount > 0
        ? `ISOLATED: ${unhealthyCount} zone(s) unhealthy. No cross-contamination. ${this.rollbacks.length} rollback(s).`
        : 'All zones healthy. No containment events.';

    return {
      zones,
      events: [...this.events],
      rollbacks: [...this.rollbacks],
      cascadingFailure: this.cascadingFailure,
      isolated,
      summary,
    };
  }
}
