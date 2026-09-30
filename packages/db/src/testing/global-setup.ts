import type { TestProject } from "vitest/node";
import { runMigrations } from "../migrate";
import {
  databaseUrl,
  dropDatabase,
  dropStaleDatabases,
  newDatabaseName,
  withServer,
} from "./server";

declare module "vitest" {
  export interface ProvidedContext {
    templateDatabase: string;
  }
}

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

  return async () => {
    await withServer((sql) => dropDatabase(sql, template));
  };
}
