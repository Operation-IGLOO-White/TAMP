// Lightweight in-memory rate limiter for auth endpoints. Tracks failures per key
// (email and/or IP) over a sliding window and locks the key out after too many.
//
// NOTE: per-process and in-memory — it resets on restart and isn't shared across
// instances. Fine for a single-instance deploy; swap the Map for Redis when you
// scale horizontally.
import { logger } from "./logger";

interface Entry {
  fails: number;
  first: number; // window start (ms)
  lockedUntil: number; // 0 if not locked
}

const buckets = new Map<string, Entry>();

const WINDOW_MS = 15 * 60_000; // 15 minutes
const MAX_FAILS = 5; // fails before lockout
const LOCK_MS = 15 * 60_000; // lockout duration

/** Throws-friendly check: returns remaining lock seconds, or 0 if allowed. */
export function lockedFor(key: string): number {
  const e = buckets.get(key);
  if (!e) return 0;
  const now = Date.now();
  if (e.lockedUntil > now) return Math.ceil((e.lockedUntil - now) / 1000);
  return 0;
}

/** Record a failed attempt; locks the key once MAX_FAILS is reached in-window. */
export function recordFailure(key: string): void {
  const now = Date.now();
  const e = buckets.get(key);
  if (!e || now - e.first > WINDOW_MS) {
    buckets.set(key, { fails: 1, first: now, lockedUntil: 0 });
    return;
  }
  e.fails += 1;
  if (e.fails >= MAX_FAILS) {
    e.lockedUntil = now + LOCK_MS;
    logger.warn("auth_lockout", { key, fails: e.fails });
  }
}

/** Clear a key's failures on a successful attempt. */
export function recordSuccess(key: string): void {
  buckets.delete(key);
}

// Periodically evict stale buckets so the Map doesn't grow unbounded.
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of buckets) {
      if (e.lockedUntil < now && now - e.first > WINDOW_MS) buckets.delete(k);
    }
  }, WINDOW_MS);
  // Don't keep the process alive for this.
  (timer as { unref?: () => void }).unref?.();
}
