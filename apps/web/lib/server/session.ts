import "server-only";
import { schema } from "@zaydemy/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";
import { getDb } from "./db";

/** The signed-in session, once per request; `null` when signed out. */
export const getSession = cache(async () => getAuth().api.getSession({ headers: await headers() }));

/** Pages behind sign-in: redirects to /login without a session. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * The user's active memberships (passive ones cannot be acted in). The
 * organization the session acts in is the picked one if still listed here,
 * otherwise the first. The picker is a filter, never a permission:
 * membership is re-checked by `resolveTenantContext`.
 */
export async function listMemberships(userId: string) {
  return getDb()
    .select({
      organizationId: schema.member.organizationId,
      role: schema.member.role,
      name: schema.organization.name,
      defaultLocale: schema.organization.defaultLocale,
      timeZone: schema.organization.timeZone,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(and(eq(schema.member.userId, userId), eq(schema.member.status, "active")))
    .orderBy(schema.member.createdAt);
}

/** Client IP as forwarded by the reverse proxy in front of the app. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
