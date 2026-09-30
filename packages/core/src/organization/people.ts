import { schema, type Database } from "@zaydemy/db";
import type { MemberRole, MemberStatus } from "@zaydemy/db/schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { TenantContext } from "../tenancy/context";
import { assignableRoles, canManageMember, managesOrganization } from "../tenancy/permissions";
import { contextOf, withTenant, type TenantTransaction } from "../tenancy/with-tenant";
import { forbidden, notFound, ok, type Denied } from "./results";

const { member, team, teamMember, user } = schema;

export interface PersonRow {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  classIds: string[];
  joinedAt: Date;
}

export interface PeopleFilter {
  role?: MemberRole;
  status?: MemberStatus;
  classId?: string;
}

/** Does `userId` teach (is assigned to) the class? */
async function teaches(tx: TenantTransaction, userId: string, teamId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: teamMember.id })
    .from(teamMember)
    .where(and(eq(teamMember.teamId, teamId), eq(teamMember.userId, userId)))
    .limit(1);
  return Boolean(row);
}

async function taughtClassIds(tx: TenantTransaction, userId: string): Promise<string[]> {
  const rows = await tx
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .where(eq(teamMember.userId, userId));
  return rows.map((row) => row.teamId);
}

/**
 * People the actor may see: owners and admins see everyone; instructors see
 * the students of the classes they teach; students see nobody here (a class
 * member list for students arrives with the community module).
 */
export async function listPeople(
  tx: TenantTransaction,
  filter: PeopleFilter = {},
): Promise<{ status: "ok"; people: PersonRow[] } | Denied> {
  const context = contextOf(tx);
  let visibleIds: string[] | null = null;

  if (context.role === "student") return forbidden;
  if (context.role === "instructor") {
    const classes = await taughtClassIds(tx, context.userId);
    if (classes.length === 0) return { status: "ok", people: [] };
    const rows = await tx
      .selectDistinct({ userId: teamMember.userId })
      .from(teamMember)
      .innerJoin(member, eq(member.userId, teamMember.userId))
      .where(and(inArray(teamMember.teamId, classes), eq(member.role, "student")));
    visibleIds = rows.map((row) => row.userId);
    if (visibleIds.length === 0) return { status: "ok", people: [] };
  }

  const conditions = [
    eq(member.organizationId, context.organizationId),
    visibleIds ? inArray(member.userId, visibleIds) : undefined,
    filter.role ? eq(member.role, filter.role) : undefined,
    filter.status ? eq(member.status, filter.status) : undefined,
    filter.classId
      ? inArray(
          member.userId,
          tx
            .select({ userId: teamMember.userId })
            .from(teamMember)
            .where(eq(teamMember.teamId, filter.classId)),
        )
      : undefined,
  ];

  const members = await tx
    .select({
      userId: member.userId,
      name: user.name,
      email: user.email,
      role: member.role,
      status: member.status,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(...conditions))
    // Locale-aware ordering happens in the UI; this keeps the list stable.
    .orderBy(asc(user.name), asc(user.email));

  const assignments =
    members.length === 0
      ? []
      : await tx
          .select({ userId: teamMember.userId, teamId: teamMember.teamId })
          .from(teamMember)
          .where(
            inArray(
              teamMember.userId,
              members.map((m) => m.userId),
            ),
          );

  const classesByUser = new Map<string, string[]>();
  for (const { userId, teamId } of assignments) {
    classesByUser.set(userId, [...(classesByUser.get(userId) ?? []), teamId]);
  }
  return {
    status: "ok",
    people: members.map((m) => ({ ...m, classIds: classesByUser.get(m.userId) ?? [] })),
  };
}

export interface AddPersonInput {
  name: string;
  email: string;
  role: MemberRole;
  classIds?: string[];
}

export type AddPersonResult =
  | {
      status: "added";
      userId: string;
      /** False when the address already had an account (in another organization). */
      newAccount: boolean;
      name: string;
      email: string;
      /** The account's preferred locale, for the welcome email. */
      locale: string | null;
    }
  | { status: "invalid-name" }
  | { status: "invalid-email" }
  | { status: "invalid-class" }
  | { status: "already-member" }
  | Denied;

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Adds a person to the organization, creating their account if the address
 * is new. Accounts are global: someone who already studies elsewhere keeps
 * one account and gains a membership here.
 *
 * Looking up the address has to happen outside row level security (the
 * tenant only sees its own members), so this takes the owner database and
 * the verified context, and runs everything in one transaction: checks
 * first, then the account, then the membership under the tenant role.
 */
export async function addPerson(
  db: Database,
  context: TenantContext,
  input: AddPersonInput,
): Promise<AddPersonResult> {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  const email = input.email.trim().toLowerCase();
  const classIds = [...new Set(input.classIds ?? [])];
  if (!name) return { status: "invalid-name" };
  if (!emailPattern.test(email)) return { status: "invalid-email" };
  if (!assignableRoles(context.role).includes(input.role)) return forbidden;
  // Instructors add students to a class they teach, never to the organization at large.
  if (context.role === "instructor" && classIds.length === 0) return forbidden;

  return db.transaction(async (outer) => {
    const [existing] = await outer
      .select({ id: user.id, name: user.name, locale: user.locale })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    const check = await withTenant(outer, context, async (tx) => {
      if (classIds.length > 0) {
        const found = await tx.select({ id: team.id }).from(team).where(inArray(team.id, classIds));
        if (found.length !== classIds.length) return { status: "invalid-class" } as const;
        if (context.role === "instructor") {
          for (const id of classIds) if (!(await teaches(tx, context.userId, id))) return forbidden;
        }
      }
      if (existing) {
        const [membership] = await tx
          .select({ id: member.id })
          .from(member)
          .where(eq(member.userId, existing.id));
        if (membership) return { status: "already-member" } as const;
      }
      return null;
    });
    if (check) return check;

    const account =
      existing ??
      (
        await outer
          .insert(user)
          // The address is verified by the code sent on first sign-in.
          .values({ name, email, emailVerified: true })
          .returning({ id: user.id, name: user.name, locale: user.locale })
      )[0]!;

    await withTenant(outer, context, async (tx) => {
      await tx
        .insert(member)
        .values({ organizationId: context.organizationId, userId: account.id, role: input.role });
      if (classIds.length > 0) {
        await tx
          .insert(teamMember)
          .values(classIds.map((teamId) => ({ teamId, userId: account.id })));
      }
    });

    return {
      status: "added",
      userId: account.id,
      newAccount: !existing,
      // An existing account keeps the name its owner chose.
      name: account.name,
      email,
      locale: account.locale,
    } as const;
  });
}

async function memberRoles(tx: TenantTransaction, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, MemberRole>();
  const rows = await tx
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(inArray(member.userId, userIds));
  return new Map(rows.map((row) => [row.userId, row.role]));
}

/**
 * Checks that the actor may manage every target: all are members, none is
 * the actor (nobody changes their own role or status, which also keeps at
 * least one owner), each target's role is manageable, and for instructors
 * each target is a student in one of their classes.
 */
async function authorizeTargets(tx: TenantTransaction, userIds: string[]): Promise<null | Denied> {
  const context = contextOf(tx);
  if (userIds.length === 0) return notFound;
  if (userIds.includes(context.userId)) return forbidden;
  const roles = await memberRoles(tx, userIds);
  if (roles.size !== new Set(userIds).size) return notFound;
  for (const role of roles.values()) if (!canManageMember(context.role, role)) return forbidden;

  if (context.role === "instructor") {
    const classes = await taughtClassIds(tx, context.userId);
    if (classes.length === 0) return forbidden;
    const rows = await tx
      .selectDistinct({ userId: teamMember.userId })
      .from(teamMember)
      .where(and(inArray(teamMember.userId, userIds), inArray(teamMember.teamId, classes)));
    if (rows.length !== new Set(userIds).size) return forbidden;
  }
  return null;
}

export async function setMemberRole(
  tx: TenantTransaction,
  userId: string,
  role: MemberRole,
): Promise<typeof ok | Denied> {
  const denied = await authorizeTargets(tx, [userId]);
  if (denied) return denied;
  if (!assignableRoles(contextOf(tx).role).includes(role)) return forbidden;
  await tx.update(member).set({ role }).where(eq(member.userId, userId));
  return ok;
}

/** Passive members keep their history but cannot act here; see memberStatuses. */
export async function setMemberStatus(
  tx: TenantTransaction,
  userIds: string[],
  status: MemberStatus,
): Promise<typeof ok | Denied> {
  const ids = [...new Set(userIds)];
  const denied = await authorizeTargets(tx, ids);
  if (denied) return denied;
  await tx
    .update(member)
    .set({
      status,
      // Keep the first departure date when saved again; retention counts from it.
      leftAt: status === "passive" ? sql`coalesce(${member.leftAt}, now())` : null,
    })
    .where(inArray(member.userId, ids));
  return ok;
}

/**
 * Removes people from the organization (their class assignments go with it;
 * their account and other organizations stay). Owners and admins only;
 * making someone passive is the reversible alternative.
 */
export async function removeMembers(
  tx: TenantTransaction,
  userIds: string[],
): Promise<typeof ok | Denied> {
  if (!managesOrganization(contextOf(tx).role)) return forbidden;
  const ids = [...new Set(userIds)];
  const denied = await authorizeTargets(tx, ids);
  if (denied) return denied;
  await tx.delete(member).where(inArray(member.userId, ids));
  return ok;
}

async function authorizeClassChange(
  tx: TenantTransaction,
  userIds: string[],
  teamId: string,
): Promise<null | Denied> {
  const context = contextOf(tx);
  const [cls] = await tx.select({ id: team.id }).from(team).where(eq(team.id, teamId));
  if (!cls) return notFound;
  if (managesOrganization(context.role)) {
    const roles = await memberRoles(tx, userIds);
    return roles.size === new Set(userIds).size ? null : notFound;
  }
  if (context.role !== "instructor" || !(await teaches(tx, context.userId, teamId)))
    return forbidden;
  // Instructors move students only; assigning staff to classes is for owners and admins.
  const roles = await memberRoles(tx, userIds);
  if (roles.size !== new Set(userIds).size) return notFound;
  for (const role of roles.values()) if (role !== "student") return forbidden;
  return null;
}

/** Assigns people to a class (keeps their other classes). */
export async function addToClass(
  tx: TenantTransaction,
  userIds: string[],
  teamId: string,
): Promise<typeof ok | Denied> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return notFound;
  const denied = await authorizeClassChange(tx, ids, teamId);
  if (denied) return denied;
  await tx
    .insert(teamMember)
    .values(ids.map((userId) => ({ teamId, userId })))
    .onConflictDoNothing({ target: [teamMember.teamId, teamMember.userId] });
  return ok;
}

/** Removes people from one class; their other classes stay. */
export async function removeFromClass(
  tx: TenantTransaction,
  userIds: string[],
  teamId: string,
): Promise<typeof ok | Denied> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return notFound;
  const denied = await authorizeClassChange(tx, ids, teamId);
  if (denied) return denied;
  await tx
    .delete(teamMember)
    .where(and(eq(teamMember.teamId, teamId), inArray(teamMember.userId, ids)));
  return ok;
}
