import { defineConfig } from "drizzle-kit";
import "./src/cli/env";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  // Only `migrate`, `push` and `studio` connect; `generate` works without a database.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
