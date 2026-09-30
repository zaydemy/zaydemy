import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Scripts run from the package directory; the shared `.env` lives at the
// repository root. Variables already set in the environment win.
const rootEnv = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** Operator-facing: scripts are run by whoever installs zaydemy, in English. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[db] ${name} is not set. Add it to .env (see .env.example).`);
    process.exit(1);
  }
  return value;
}
