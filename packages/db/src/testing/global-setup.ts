import type { TestProject } from "vitest/node";
import "./provided-context";
import { runMigrations } from "../migrate";
import {
  databaseUrl,
  dropDatabase,
  dropRunDatabases,
  dropStaleDatabases,
  newDatabaseName,
  withServer,
} from "./server";

/**
 * Vitest global setup: migrates a template database once per run. Test files
 * clone it (`CREATE DATABASE ... TEMPLATE`), which copies the migrated schema
 * in milliseconds instead of re-running migrations.
 */
export default async function setup(project: TestProject) {
  const template = newDatabaseName();

  await withServer(async (sql) => {
    await dropStaleDatabases(sql);
    await sql`create database ${sql(template)}`;
  });
  await runMigrations(databaseUrl(template));

  project.provide("templateDatabase", template);

  // Also drops the per-file clones, in case a file was interrupted before
  // its own cleanup ran.
  return async () => {
    await withServer(async (sql) => {
      await dropRunDatabases(sql, template);
      await dropDatabase(sql, template);
    });
  };
}
