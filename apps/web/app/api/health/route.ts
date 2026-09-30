// Liveness probe for Docker and reverse proxies. Stays dependency-free so it
// answers even when downstream services (database, email) are degraded.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
