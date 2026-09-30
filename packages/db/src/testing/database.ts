import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, inject } from "vitest";
import { createDatabase, type DatabaseConnection, type Transaction } from "../client";
import "./provided-context";
import { databaseUrl, dropDatabase, withServer } from "./server";

class Rollback extends Error {}

export interface TestDatabase {
  /** The file's own database. Writes made outside `rollback` persist until the file ends. */
  readonly db: DatabaseConnection["db"];
  /** Runs `fn` in a transaction that is always rolled back, so tests never see each other's rows. */
  rollback<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

/**
 * Gives the calling test file a private, migrated database cloned from the
 * run's template, and drops it when the file finishes. Files run in parallel
 * without sharing any state; call once at the top level of a test file.
 */
export function useTestDatabase(): TestDatabase {
  let name: string | undefined;
  let connection: DatabaseConnection | undefined;

  beforeAll(async () => {
    const template = inject("templateDatabase");
    // Prefixed with the template's name so the run's teardown can find it.
    const clone = `${template}_${randomBytes(4).toString("hex")}`;
    await withServer((sql) => sql`create database ${sql(clone)} template ${sql(template)}`);
    name = clone;
    connection = createDatabase(databaseUrl(clone), { max: 2 });
  });

  afterAll(async () => {
    await connection?.close();
    if (name) await withServer((sql) => dropDatabase(sql, name!));
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
