import { schema } from "@zaydemy/db";
import type { MemberRole } from "@zaydemy/db/schema";
import { and, asc, eq, exists, sql } from "drizzle-orm";
import { contextOf, type TenantTransaction } from "./with-tenant";

const { team, teamMember } = schema;

/** Roles that manage the organization and see every class in it. */
const organizationWideRoles: ReadonlySet<MemberRole> = new Set(["owner", "admin"]);

export function seesAllClasses(role: MemberRole): boolean {
  return organizationWideRoles.has(role);
}

/**
 * Condition "the current user may access this class": every class for owners
 * and admins, otherwise the classes the user is assigned to (taught for
 * instructors, enrolled for students).
 *
 * This is authorization, not the class picker. The picker narrows what lists
 * show; access to a class's pages never depends on which class is selected.
 */
function accessibleClass(tx: TenantTransaction) {
  const { userId, organizationId, role } = contextOf(tx);
  const inTenant = eq(team.organizationId, organizationId);
  if (seesAllClasses(role)) return inTenant;
  return and(
    inTenant,
    exists(
      tx
        .select({ one: sql`1` })
        .from(teamMember)
        .where(and(eq(teamMember.teamId, team.id), eq(teamMember.userId, userId))),
    ),
  );
}

/** Classes the current user may access; archived classes last. */
export async function listAccessibleClasses(tx: TenantTransaction) {
  return tx
    .select({
      id: team.id,
      name: team.name,
      kind: team.kind,
      color: team.color,
      archivedAt: team.archivedAt,
    })
    .from(team)
    .where(accessibleClass(tx))
    .orderBy(sql`${team.archivedAt} is not null`, asc(team.name));
}

export async function canAccessClass(tx: TenantTransaction, teamId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: team.id })
    .from(team)
    .where(and(eq(team.id, teamId), accessibleClass(tx)))
    .limit(1);
  return Boolean(row);
}
