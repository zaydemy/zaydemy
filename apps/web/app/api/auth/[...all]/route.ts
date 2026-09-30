import { getAuth } from "@/lib/server/auth";

// Better Auth's HTTP endpoints. Only an allowlist answers; see
// packages/auth/src/http-allowlist.ts.
const handler = (request: Request) => getAuth().handler(request);

export { handler as GET, handler as POST };
