import { schema } from "@zaydemy/db";
import type { MemberRole, MemberStatus, TeamKind } from "@zaydemy/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { canAccessClass, listAccessibleClasses } from "../tenancy/access";
import { isStaff, managesOrganization } from "../tenancy/permissions";
import { contextOf, type TenantTransaction } from "../tenancy/with-tenant";
import { forbidden, notFound, ok, type Denied } from "./results";

const { team, teamMember } = schema;

export interface ClassInput {
  name: string;
  kind?: TeamKind;
  /** `#rrggbb` or `#rgb`, any case; empty for the derived colour. */
  color?: string | null;
}

type InvalidInput = { status: "invalid-name" } | { status: "invalid-color" };

/** `#ABC` → `#aabbcc`; null when it is not a hex colour. */
export function normalizeColor(value: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex = match[1]!.toLowerCase();
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
}

function validate(
  input: Partial<ClassInput>,
): InvalidInput | { values: Partial<typeof team.$inferInsert> } {
  const values: Partial<typeof team.$inferInsert> = {};
  if (input.name !== undefined) {
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > 120) return { status: "invalid-name" };
    values.name = name;
  }
  if (input.kind !== undefined) values.kind = input.kind;
  if (input.color !== undefined) {
    if (!input.color) values.color = null;
    else {
      const color = normalizeColor(input.color);
      if (!color) return { status: "invalid-color" };
      values.color = color;
    }
  }
  return { values };
}

/** Owners and admins only; instructors are assigned to classes, they do not create them. */
export async function createClass(
  tx: TenantTransaction,
  input: ClassInput,
): Promise<{ status: "created"; id: string } | InvalidInput | Denied> {
  const context = contextOf(tx);
  if (!managesOrganization(context.role)) return forbidden;
  const parsed = validate({ kind: "class", ...input });
  if ("status" in parsed) return parsed;

  const [row] = await tx
    .insert(team)
    .values({ organizationId: context.organizationId, name: parsed.values.name!, ...parsed.values })
    .returning({ id: team.id });
  return { status: "created", id: row!.id };
}

export async function updateClass(
  tx: TenantTransaction,
  id: string,
  input: Partial<Omit<ClassInput, "kind">>,
): Promise<typeof ok | InvalidInput | Denied> {
  if (!managesOrganization(contextOf(tx).role)) return forbidden;
  const parsed = validate(input);
  if ("status" in parsed) return parsed;
  const updated = await tx
    .update(team)
    .set(parsed.values)
    .where(eq(team.id, id))
    .returning({ id: team.id });
  return updated.length > 0 ? ok : notFound;
}

/** Archived classes keep their history and leave pickers and active lists. */
export async function setClassArchived(
  tx: TenantTransaction,
  id: string,
  archived: boolean,
): Promise<typeof ok | Denied> {
  if (!managesOrganization(contextOf(tx).role)) return forbidden;
  const updated = await tx
    .update(team)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(team.id, id))
    .returning({ id: team.id });
  return updated.length > 0 ? ok : notFound;
}

/**
 * Deletes a class. With members it refuses unless `force`: people stay in the
 * organization, but their assignment to this class (and, later, its sessions
 * and attendance) goes with it. Archiving is usually what people want.
 */
export async function deleteClass(
  tx: TenantTransaction,
  id: string,
  options: { force?: boolean } = {},
): Promise<typeof ok | { status: "not-empty"; members: number } | Denied> {
  if (!managesOrganization(contextOf(tx).role)) return forbidden;
  const [row] = await tx
    .select({ members: count() })
    .from(teamMember)
    .where(eq(teamMember.teamId, id));
  const members = row?.members ?? 0;
  if (members > 0 && !options.force) return { status: "not-empty", members };
  const deleted = await tx
    .delete(team)
    .where(and(eq(team.id, id)))
    .returning({ id: team.id });
  return deleted.length > 0 ? ok : notFound;
}

export interface ClassOverview {
  id: string;
  name: string;
  kind: TeamKind;
  color: string | null;
  archivedAt: Date | null;
  instructors: number;
  students: number;
}

/** Classes the actor may access, with head counts; archived classes last. */
export async function listClassOverview(tx: TenantTransaction): Promise<ClassOverview[]> {
  const classes = await listAccessibleClasses(tx);
  if (classes.length === 0) return [];
  const counts = await tx
    .select({ teamId: teamMember.teamId, role: schema.member.role, people: count() })
    .from(teamMember)
    .innerJoin(schema.member, eq(schema.member.userId, teamMember.userId))
    .where(
      and(
        inArray(
          teamMember.teamId,
          classes.map((c) => c.id),
        ),
        eq(schema.member.status, "active"),
      ),
    )
    .groupBy(teamMember.teamId, schema.member.role);

  return classes.map((c) => {
    const rows = counts.filter((row) => row.teamId === c.id);
    return {
      ...c,
      instructors: rows
        .filter((row) => row.role !== "student")
        .reduce((sum, row) => sum + row.people, 0),
      students: rows.find((row) => row.role === "student")?.people ?? 0,
    };
  });
}

export interface ClassRoster {
  id: string;
  name: string;
  kind: TeamKind;
  color: string | null;
  archivedAt: Date | null;
  members: {
    userId: string;
    name: string;
    email: string;
    role: MemberRole;
    status: MemberStatus;
  }[];
}

/** A class and its people. Staff with access to the class only. */
export async function getClassRoster(
  tx: TenantTransaction,
  id: string,
): Promise<{ status: "ok"; roster: ClassRoster } | Denied> {
  const context = contextOf(tx);
  if (!isStaff(context.role)) return forbidden;
  if (!(await canAccessClass(tx, id))) return notFound;
  const [cls] = await tx
    .select({
      id: team.id,
      name: team.name,
      kind: team.kind,
      color: team.color,
      archivedAt: team.archivedAt,
    })
    .from(team)
    .where(eq(team.id, id));
  if (!cls) return notFound;
  const members = await tx
    .select({
      userId: schema.member.userId,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.member.role,
      status: schema.member.status,
    })
    .from(teamMember)
    .innerJoin(schema.member, eq(schema.member.userId, teamMember.userId))
    .innerJoin(schema.user, eq(schema.user.id, teamMember.userId))
    .where(eq(teamMember.teamId, id))
    .orderBy(schema.user.name);
  return { status: "ok", roster: { ...cls, members } };
}
