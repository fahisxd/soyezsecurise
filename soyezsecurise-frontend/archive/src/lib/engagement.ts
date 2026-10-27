/** Future integration boundary. No network requests, identifiers or persisted reading history. */
export type EngagementSignal = { type: 'view' | 'skip' | 'bookmark' | 'completion'; flashId: string };
export interface EngagementSink { record(signal: EngagementSignal): void }
export const engagement: EngagementSink = { record() { /* Phase 1 deliberately collects nothing. */ } };

/** Optional coarse aggregation for a future consent-based sink; not enabled by the app. */
export class MemoryAggregate implements EngagementSink {
  readonly counts = new Map<string, Partial<Record<EngagementSignal['type'], number>>>();
  record({ type, flashId }: EngagementSignal) {
    const counts = this.counts.get(flashId) ?? {};
    counts[type] = (counts[type] ?? 0) + 1;
    this.counts.set(flashId, counts);
  }
}
