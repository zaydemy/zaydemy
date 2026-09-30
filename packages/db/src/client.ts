import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDrizzle>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** A database handle or an open transaction. */
export type Executor = Database | Transaction;

/**
 * The role tenant-scoped transactions switch to. Row level security applies to
 * it; see migrations/0002_row_level_security.sql.
 */
export const appRole = "zaydemy_app";

function createDrizzle(client: postgres.Sql) {
  return drizzle(client, { schema });
}

export interface DatabaseConnection {
  db: Database;
  /** Closes the pool; call on shutdown and at the end of scripts and tests. */
  close: () => Promise<void>;
}

/**
 * Opens a connection pool. The pool connects lazily on the first query, so
 * creating it at build time (when no database exists) is safe.
 *
 * Callers own the lifetime: the web app keeps one pool per process, scripts
 * and tests close theirs.
 */
export function createDatabase(url: string, options: { max?: number } = {}): DatabaseConnection {
  const client = postgres(url, {
    max: options.max ?? 10,
    connect_timeout: 10,
    // "relation already exists, skipping" and similar notices are noise.
    onnotice: () => {},
  });
  return {
    db: createDrizzle(client),
    close: () => client.end({ timeout: 5 }),
  };
}
