import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Self-hosted via Docker: ship only the node_modules the server needs.
  output: "standalone",
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@zaydemy/i18n"],
};

export default withNextIntl(nextConfig);
