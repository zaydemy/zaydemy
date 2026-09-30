import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted via Docker: ship only the node_modules the server needs.
  output: "standalone",
};

export default nextConfig;
