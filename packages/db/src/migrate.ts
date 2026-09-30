import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Resolved from this file, not the working directory, so any caller finds it. */
export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Applies pending migrations. Runs as a separate deployment step before the app
 * starts, never at build time and never from inside a web process: with
 * several replicas, each would race to migrate.
 */
export async function runMigrations(url: string): Promise<void> {
  // A single session: DDL must not go through a transaction-mode pooler.
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}
