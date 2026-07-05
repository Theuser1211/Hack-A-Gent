import { DeadLetterQueue } from './dead-letter-queue.js';
import type { EventEnvelope, EventAck, EventMetadata } from './event-envelope.js';
import { JsonlEventStore, type ReplayOptions } from './jsonl-store.js';

// ── Subscription ──────────────────────────────────────────────────────────

export type EventHandler = (event: EventEnvelope) => Promise<void>;

interface Subscription {
  id: string;
  subscriberId: string;
  pattern: string | string[]; // exact event type(s)
  handler: EventHandler;
  filter?: (event: EventEnvelope) => boolean;
}

// ── Event Bus ─────────────────────────────────────────────────────────────

export class EventBus {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private acknowledgments: Map<string, Promise<void>> = new Map();
  private readonly store: JsonlEventStore;
  private readonly dlq: DeadLetterQueue;
  private running = false;
  private subscriptionCounter = 0;

  constructor(baseDir: string) {
    this.store = new JsonlEventStore(baseDir);
    this.dlq = new DeadLetterQueue(baseDir);
  }

  // ── Pub/Sub ───────────────────────────────────────────────────────────

  subscribe(
    subscriberId: string,
    eventTypes: string | string[],
    handler: EventHandler,
    filter?: (event: EventEnvelope) => boolean,
  ): string {
    const id = `${subscriberId}-${this.subscriptionCounter++}`;
    const patterns = typeof eventTypes === 'string' ? [eventTypes] : eventTypes;

    for (const pattern of patterns) {
      const existing = this.subscriptions.get(pattern) ?? [];
      existing.push({ id, subscriberId, pattern, handler, filter });
      this.subscriptions.set(pattern, existing);
    }

    return id;
  }

  unsubscribe(id: string): void {
    for (const [pattern, subs] of this.subscriptions.entries()) {
      const filtered = subs.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        this.subscriptions.delete(pattern);
      } else {
        this.subscriptions.set(pattern, filtered);
      }
    }
  }

  // ── Publishing ──────────────────────────────────────────────────────────

  async publish(event: EventEnvelope): Promise<void> {
    // Persist
    await this.store.append(event);

    // Route
    const targets = this.resolveTargets(event);
    const promises = targets.map((handler) => this.deliver(event, handler));

    await Promise.allSettled(promises);
  }

  async publishAndWait(event: EventEnvelope): Promise<void> {
    await this.store.append(event);
    const targets = this.resolveTargets(event);
    const promises = targets.map((handler) => this.deliver(event, handler));

    const results = await Promise.allSettled(promises);
    const rejected = results.filter((r) => r.status === 'rejected');
    if (rejected.length > 0) {
      throw new AggregateError(
        rejected.map((r) => (r as PromiseRejectedResult).reason),
        `Event delivery failed for ${event.type}`,
      );
    }
  }

  private resolveTargets(event: EventEnvelope): EventHandler[] {
    const handlers: EventHandler[] = [];
    const target = event.target;

    if (target === '*') {
      // Broadcast: all subscriptions
      for (const subs of this.subscriptions.values()) {
        for (const sub of subs) {
          if (this.matchesPattern(event.type, sub.pattern)) {
            if (!sub.filter || sub.filter(event)) {
              handlers.push(sub.handler);
            }
          }
        }
      }
    } else {
      const targets = typeof target === 'string' ? [target] : target;
      for (const t of targets) {
        for (const [pattern, subs] of this.subscriptions.entries()) {
          if (this.matchesPattern(event.type, pattern)) {
            for (const sub of subs) {
              if ((sub.subscriberId === t || t === '*') && (!sub.filter || sub.filter(event))) {
                handlers.push(sub.handler);
              }
            }
          }
        }
      }
    }

    return handlers;
  }

  private matchesPattern(eventType: string, pattern: string | string[]): boolean {
    if (typeof pattern === 'string') return pattern === eventType;
    return pattern.includes(eventType);
  }

  // ── Delivery ────────────────────────────────────────────────────────────

  private async deliver(event: EventEnvelope, handler: EventHandler): Promise<void> {
    try {
      await handler(event);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (event.metadata.retry_count < event.metadata.max_retries) {
        // Retry with backoff
        const backoffMs = Math.min(1000 * Math.pow(2, event.metadata.retry_count), 30000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        const retryEvent: EventEnvelope = {
          ...event,
          metadata: { ...event.metadata, retry_count: event.metadata.retry_count + 1 },
        };
        await this.deliver(retryEvent, handler);
      } else {
        await this.dlq.send(event, reason);
      }
    }
  }

  // ── Acknowledgement ────────────────────────────────────────────────────

  async acknowledge(ack: EventAck): Promise<void> {
    // Record acknowledgment (used for exactly-once semantics)
    if (ack.status === 'rejected') {
      const event: EventEnvelope = {
        event_id: ack.event_id,
        type: 'ACK_REJECTED',
        source: 'event-bus',
        target: 'system',
        timestamp: new Date().toISOString(),
        schema_version: '1.0',
        correlation_id: ack.event_id,
        causation_id: null,
        payload: {},
        metadata: {
          priority: 'normal',
          delivery_guarantee: 'at_most_once',
          ttl_ms: 300000,
          retry_count: 0,
          max_retries: 0,
          blocking: false,
          persist: false,
        },
      };
      await this.dlq.send(event, ack.reason ?? 'rejected');
    }
  }

  // ── Replay ──────────────────────────────────────────────────────────────

  replay(options?: ReplayOptions): AsyncGenerator<EventEnvelope> {
    return this.store.replay(options);
  }

  // ── Dead Letter Queue ──────────────────────────────────────────────────

  getDeadLetterQueue(): DeadLetterQueue {
    return this.dlq;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}
