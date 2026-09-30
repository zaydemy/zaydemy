import { afterAll, beforeAll, inject } from "vitest";
import { createDatabase, type Database, type DatabaseConnection } from "../client";
import { databaseUrl, dropDatabase, newDatabaseName, withServer } from "./server";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

class Rollback extends Error {}

export interface TestDatabase {
  /** The file's own database. Writes made outside `rollback` persist until the file ends. */
  readonly db: Database;
  /** Runs `fn` in a transaction that is always rolled back, so tests never see each other's rows. */
  rollback<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

/**
 * Gives the calling test file a private, migrated database cloned from the
 * run's template, and drops it when the file finishes. Files run in parallel
 * without sharing any state; call once at the top level of a test file.
 */
export function useTestDatabase(): TestDatabase {
  const name = newDatabaseName();
  let connection: DatabaseConnection | undefined;

  beforeAll(async () => {
    const template = inject("templateDatabase");
    await withServer((sql) => sql`create database ${sql(name)} template ${sql(template)}`);
    connection = createDatabase(databaseUrl(name), { max: 2 });
  });

  afterAll(async () => {
    await connection?.close();
    await withServer((sql) => dropDatabase(sql, name));
  });

  const db = () => {
    if (!connection) throw new Error("The test database is only available inside tests and hooks.");
    return connection.db;
  };

  return {
    get db() {
      return db();
    },
    async rollback(fn) {
      let result: Awaited<ReturnType<typeof fn>> | undefined;
      try {
        await db().transaction(async (tx) => {
          result = await fn(tx);
          throw new Rollback();
        });
      } catch (error) {
        if (!(error instanceof Rollback)) throw error;
      }
      return result as Awaited<ReturnType<typeof fn>>;
    },
  };
}
