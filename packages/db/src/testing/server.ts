import { randomBytes } from "node:crypto";
import postgres from "postgres";

/** Every database the harness creates starts with this prefix. */
export const testDatabasePrefix = "zaydemy_test_";

// Stale databases from crashed runs are dropped after this long. Concurrent
// runs (turbo runs packages in parallel) are never that old.
const staleAfterMs = 60 * 60 * 1000;

export function serverUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a Postgres server where the test role may create databases (see .env.example).",
    );
  }
  return url;
}

/** Same server and credentials, different database. */
export function databaseUrl(name: string): string {
  const url = new URL(serverUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

/** `zaydemy_test_<epoch ms>_<random>`: unique, and its age is readable from the name. */
export function newDatabaseName(): string {
  return `${testDatabasePrefix}${Date.now()}_${randomBytes(4).toString("hex")}`;
}

/** Runs `fn` with a single connection to the server's maintenance database. */
export async function withServer<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(serverUrl(), { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function dropDatabase(sql: postgres.Sql, name: string): Promise<void> {
  await sql`drop database if exists ${sql(name)} with (force)`;
}

/** Drops the databases cloned from `template` during its run. */
export async function dropRunDatabases(sql: postgres.Sql, template: string): Promise<void> {
  const rows = await sql<{ datname: string }[]>`
    select datname from pg_database
     where starts_with(datname, ${`${template}_`})
  `;
  for (const { datname } of rows) await dropDatabase(sql, datname);
}

export async function dropStaleDatabases(sql: postgres.Sql): Promise<void> {
  const rows = await sql<{ datname: string }[]>`
    select datname from pg_database where datname like ${`${testDatabasePrefix}%`}
  `;
  const cutoff = Date.now() - staleAfterMs;
  for (const { datname } of rows) {
    const createdAt = Number(datname.slice(testDatabasePrefix.length).split("_")[0]);
    if (Number.isFinite(createdAt) && createdAt < cutoff) await dropDatabase(sql, datname);
  }
}
