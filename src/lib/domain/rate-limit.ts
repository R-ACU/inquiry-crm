/**
 * Sliding-window counter kept in memory. It throttles a single client before
 * any database work happens, for example repeated requests with wrong keys.
 *
 * It is a first line only: on serverless hosting each instance has its own
 * memory. The binding per-key limit lives in public.ingest_inquiry and holds
 * across instances.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxTrackedClients = 10_000,
  ) {}

  /** Records a hit and reports whether it is allowed, plus seconds until the next free slot. */
  check(clientId: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.now();
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(clientId) ?? []).filter((t) => t > windowStart);

    if (recent.length >= this.limit) {
      this.hits.set(clientId, recent);
      const retryAfterMs = recent[0] + this.windowMs - now;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    recent.push(now);
    // Re-insert so Map order reflects recency; the oldest client is evicted first.
    this.hits.delete(clientId);
    this.hits.set(clientId, recent);
    while (this.hits.size > this.maxTrackedClients) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
