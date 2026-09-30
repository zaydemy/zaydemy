import { index, pgTable, text } from "drizzle-orm/pg-core";
import { id, timestamptz } from "./columns";

/*
 * Instance-wide tables that belong to no tenant. They are never granted to
 * the row-level-security role; only the owner connection uses them.
 */

/**
 * Sliding-window rate limit hits. Kept in the database rather than in memory:
 * an in-memory counter resets on every deploy (wait for a restart, get a fresh
 * quota) and multiplies with each replica.
 */
export const rateLimitHit = pgTable(
  "rate_limit_hit",
  {
    id: id(),
    key: text("key").notNull(),
    hitAt: timestamptz("hit_at").notNull().defaultNow(),
  },
  (t) => [index("rate_limit_hit_key_idx").on(t.key, t.hitAt)],
);
