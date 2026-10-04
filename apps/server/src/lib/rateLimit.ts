/** Balde de fichas por chave (participante): `capacity` de rajada, `refillPerSec` sustentado. */
export class TokenBucket {
  private buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private capacity: number,
    private refillPerSec: number,
    private now: () => number = Date.now,
  ) {}

  take(key: string): boolean {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.at) / 1000) * this.refillPerSec);
    b.at = t;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    return ok;
  }

  forget(key: string) {
    this.buckets.delete(key);
  }
}
