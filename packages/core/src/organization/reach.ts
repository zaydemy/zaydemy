import { schema } from "@zaydemy/db";
import { and, eq, inArray } from "drizzle-orm";
import { managesOrganization } from "../tenancy/permissions";
import { contextOf, type TenantTransaction } from "../tenancy/with-tenant";

const { member, teamMember } = schema;

/*
 * "Reach": which classes and students a staff member acts on. Owners and
 * admins reach the whole organization; instructors reach the classes they
 * are assigned to and the students in them.
 */

/** Is `userId` assigned to the class (teaches it, for staff)? */
export async function teaches(
  tx: TenantTransaction,
  userId: string,
  teamId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function taughtClassIds(tx: TenantTransaction, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .where(eq(teamMember.userId, userId));
  return rows.map((row) => row.teamId);
}

/** May the actor manage things given to this class? Owners/admins, or the class's instructor. */
export async function reachesClass(tx: TenantTransaction, teamId: string): Promise<boolean> {
  const context = contextOf(tx);
  if (managesOrganization(context.role)) return true;
  return context.role === "instructor" && teaches(tx, context.userId, teamId);
}

/** May the actor manage things given to this student? Owners/admins, or an instructor of one of their classes. */
export async function reachesStudent(tx: TenantTransaction, userId: string): Promise<boolean> {
  const context = contextOf(tx);
  if (managesOrganization(context.role)) return true;
  if (context.role !== "instructor") return false;
  const classes = await taughtClassIds(tx, context.userId);
  if (classes.length === 0) return false;
  const [row] = await tx
    .select({ id: teamMember.id })
    .from(teamMember)
    .innerJoin(member, eq(member.userId, teamMember.userId))
    .where(
      and(
        eq(teamMember.userId, userId),
        inArray(teamMember.teamId, classes),
        eq(member.role, "student"),
      ),
    )
    .limit(1);
  return Boolean(row);
}
