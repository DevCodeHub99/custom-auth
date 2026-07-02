export interface RateLimitStore {
  increment(key: string, limit: number, windowMs: number): Promise<{ success: boolean; remaining: number }>;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private hits: Map<string, { count: number; expiresAt: number }> = new Map();
  private lastCleanup = Date.now();
  private cleanupIntervalMs = 60_000; // clean up every minute

  async increment(key: string, limit: number, windowMs: number): Promise<{ success: boolean; remaining: number }> {
    const now = Date.now();

    // Lazy periodic cleanup of expired keys
    if (now - this.lastCleanup > this.cleanupIntervalMs) {
      for (const [k, record] of this.hits.entries()) {
        if (record.expiresAt < now) {
          this.hits.delete(k);
        }
      }
      this.lastCleanup = now;
    }

    const record = this.hits.get(key);

    if (!record || record.expiresAt < now) {
      this.hits.set(key, { count: 1, expiresAt: now + windowMs });
      return { success: true, remaining: limit - 1 };
    }

    if (record.count >= limit) {
      return { success: false, remaining: 0 };
    }

    record.count += 1;
    return { success: true, remaining: limit - record.count };
  }
}

export class RateLimiter {
  private store: RateLimitStore;
  
  constructor(store?: RateLimitStore) {
    this.store = store || new InMemoryRateLimitStore();
  }

  async check(key: string, limit: number = 10, windowMs: number = 60000): Promise<boolean> {
    const result = await this.store.increment(key, limit, windowMs);
    return result.success;
  }
}
