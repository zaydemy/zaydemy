import { existsSync } from "node:fs";
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
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@zaydemy/adapters", "@zaydemy/config", "@zaydemy/i18n"],
};

export default withNextIntl(nextConfig);
