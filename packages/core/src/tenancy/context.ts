import { schema, type Executor } from "@zaydemy/db";
import { and, eq } from "drizzle-orm";
import type { MemberRole, PlatformRole } from "@zaydemy/db/schema";

declare const verified: unique symbol;

/**
 * Who is acting, and in which tenant. Only `resolveTenantContext` creates one,
 * after checking the membership: the brand makes a hand-built object a type
 * error, so a context always stands for a real membership.
 */
export interface TenantContext {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: MemberRole;
  readonly platformRole: PlatformRole;
  readonly [verified]: true;
}

/** The user is not a member of the organization they tried to act in. */
export class NotAMemberError extends Error {
  constructor(
    readonly userId: string,
    readonly organizationId: string,
  ) {
    super(`User ${userId} is not a member of organization ${organizationId}.`);
    this.name = "NotAMemberError";
  }
}

/**
 * Builds the context for a user acting in an organization. Runs on the owner
 * connection (before any tenant is set), so it must stay a narrow lookup of
 * the caller's own membership.
 *
 * Being a platform admin does not make someone a member: acting inside a
 * tenant always requires a membership.
 */
export async function resolveTenantContext(
  db: Executor,
  { userId, organizationId }: { userId: string; organizationId: string },
): Promise<TenantContext> {
  const [row] = await db
    .select({ role: schema.member.role, platformRole: schema.user.platformRole })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)))
    .limit(1);

  if (!row) throw new NotAMemberError(userId, organizationId);
  return {
    userId,
    organizationId,
    role: row.role,
    platformRole: row.platformRole,
  } as TenantContext;
}
