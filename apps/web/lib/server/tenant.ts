import "server-only";
import {
  NotAMemberError,
  resolveTenantContext,
  withTenant,
  type TenantContext,
  type TenantTransaction,
} from "@zaydemy/core";
import { schema } from "@zaydemy/db";
import type { OrganizationPreset } from "@zaydemy/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "./db";
import { listMemberships, requireSession } from "./session";

export interface ActiveTenant {
  context: TenantContext;
  organization: { id: string; name: string; preset: OrganizationPreset };
  user: { id: string; name: string; email: string };
}

/**
 * The organization this request acts in, with a verified context; once per
 * request. Pages without any active membership send people home, which
 * explains it.
 */
export const getActiveTenant = cache(async (): Promise<ActiveTenant | null> => {
  const session = await requireSession();
  const memberships = await listMemberships(session.user.id);
  const active =
    memberships.find((m) => m.organizationId === session.session.activeOrganizationId) ??
    memberships[0];
  if (!active) return null;

  const db = getDb();
  try {
    const context = await resolveTenantContext(db, {
      userId: session.user.id,
      organizationId: active.organizationId,
    });
    const [organization] = await db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        preset: schema.organization.preset,
      })
      .from(schema.organization)
      .where(eq(schema.organization.id, active.organizationId));
    return {
      context,
      organization: organization!,
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
    };
  } catch (error) {
    if (error instanceof NotAMemberError) return null;
    throw error;
  }
});

/** Like getActiveTenant, for pages that need one: redirects home otherwise. */
export async function requireTenant(): Promise<ActiveTenant> {
  const tenant = await getActiveTenant();
  if (!tenant) redirect("/");
  return tenant;
}

/** Runs tenant-scoped data access for the active organization. */
export async function inTenant<T>(
  fn: (tx: TenantTransaction, tenant: ActiveTenant) => Promise<T>,
): Promise<T> {
  const tenant = await requireTenant();
  return withTenant(getDb(), tenant.context, (tx) => fn(tx, tenant));
}
