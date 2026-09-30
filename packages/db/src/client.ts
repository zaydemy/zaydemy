import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDrizzle>;
/** A database handle or an open transaction: queries accept either. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

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
