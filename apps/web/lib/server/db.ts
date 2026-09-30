import "server-only";
import { createDatabase, type Database } from "@zaydemy/db";
import { getConfig } from "./services";

// One pool per process. Kept on globalThis so development reloads reuse it
// instead of leaking a new pool on every change.
const globalForDb = globalThis as unknown as { zaydemyDb?: Database };

export function getDb(): Database {
  globalForDb.zaydemyDb ??= createDatabase(getConfig().databaseUrl).db;
  return globalForDb.zaydemyDb;
}
