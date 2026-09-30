import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The repository shares one `.env` at its root; Next only reads the app's own
// directory. Variables already set in the environment win.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Self-hosted via Docker: ship only the node_modules the server needs.
  output: "standalone",
  // Trace from the repository root so workspace packages end up in the output.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@zaydemy/adapters",
    "@zaydemy/auth",
    "@zaydemy/config",
    "@zaydemy/core",
    "@zaydemy/db",
    "@zaydemy/email",
    "@zaydemy/i18n",
  ],
  // The Postgres driver opens sockets; keep it out of the server bundle.
  serverExternalPackages: ["postgres"],
};

export default withNextIntl(nextConfig);
