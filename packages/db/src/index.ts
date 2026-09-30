export {
  appRole,
  createDatabase,
  type Database,
  type DatabaseConnection,
  type Executor,
  type Transaction,
} from "./client";
// Migrations: import `@zaydemy/db/migrate` (kept out of this entry point so
// app bundles never pull in the migration runner and its SQL directory).
export * as schema from "./schema";
