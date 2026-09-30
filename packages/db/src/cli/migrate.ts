import { runMigrations } from "../migrate";
import { requireEnv } from "./env";

const url = requireEnv("DATABASE_URL");
const started = Date.now();

try {
  await runMigrations(url);
  console.log(`[migrate] schema is up to date (${Date.now() - started} ms)`);
} catch (error) {
  console.error("[migrate] failed:", error);
  process.exitCode = 1;
}
