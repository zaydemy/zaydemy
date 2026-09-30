import { schema, type Executor } from "@zaydemy/db";
import { and, eq, gt, lt, sql } from "drizzle-orm";

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

/**
 * Sliding-window limiter backed by the database. Returns `true` when the key
 * is over its limit (the hit is then not recorded). Runs on the owner
 * connection; rate limits belong to no tenant.
 *
 * Two concurrent requests can both read a count one below the limit and both
 * pass. One extra request does not matter for these limits, so no locking.
 *
 * Fails open: if the database cannot be read, nobody is locked out of
 * signing in by a transient error.
 */
export async function isRateLimited(
  db: Executor,
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - rule.windowMs);
  try {
    const [row] = await db
      .select({ hits: sql<number>`count(*)::int` })
      .from(schema.rateLimitHit)
      .where(and(eq(schema.rateLimitHit.key, key), gt(schema.rateLimitHit.hitAt, since)));
    if ((row?.hits ?? 0) >= rule.max) return true;

    await db.insert(schema.rateLimitHit).values({ key, hitAt: now });
    return false;
  } catch (error) {
    console.error("[rate-limit] counter unavailable; request allowed", error);
    return false;
  }
}

/** Deletes hits older than any window in use. Run from a scheduled job. */
export async function pruneRateLimitHits(db: Executor, olderThan: Date): Promise<number> {
  const deleted = await db
    .delete(schema.rateLimitHit)
    .where(lt(schema.rateLimitHit.hitAt, olderThan))
    .returning({ id: schema.rateLimitHit.id });
  return deleted.length;
}
