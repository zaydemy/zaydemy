import { randomBytes } from "node:crypto";
import type { Executor } from "../client";
import { member, organization, team, teamMember, user, type MemberRole } from "../schema";

const suffix = () => randomBytes(4).toString("hex");

export async function createUser(db: Executor, values: Partial<typeof user.$inferInsert> = {}) {
  const tag = suffix();
  const [row] = await db
    .insert(user)
    .values({ name: `User ${tag}`, email: `user-${tag}@example.test`, ...values })
    .returning();
  return row!;
}

export async function createOrganization(
  db: Executor,
  values: Partial<typeof organization.$inferInsert> = {},
) {
  const tag = suffix();
  const [row] = await db
    .insert(organization)
    .values({ name: `Organization ${tag}`, slug: `org-${tag}`, ...values })
    .returning();
  return row!;
}

export async function addMember(
  db: Executor,
  organizationId: string,
  userId: string,
  role: MemberRole = "student",
) {
  const [row] = await db.insert(member).values({ organizationId, userId, role }).returning();
  return row!;
}

export async function createTeam(
  db: Executor,
  organizationId: string,
  values: Partial<typeof team.$inferInsert> = {},
) {
  const [row] = await db
    .insert(team)
    .values({ organizationId, name: `Class ${suffix()}`, ...values })
    .returning();
  return row!;
}

export async function addTeamMember(db: Executor, teamId: string, userId: string) {
  const [row] = await db.insert(teamMember).values({ teamId, userId }).returning();
  return row!;
}

/**
 * Two tenants with one class each, an instructor and a student per class, and
 * one person who belongs to both tenants. The baseline for isolation tests.
 */
export async function createTwoTenants(db: Executor) {
  const tenant = async () => {
    const org = await createOrganization(db);
    const cls = await createTeam(db, org.id);
    const instructor = await createUser(db);
    const student = await createUser(db);
    await addMember(db, org.id, instructor.id, "instructor");
    await addMember(db, org.id, student.id, "student");
    await addTeamMember(db, cls.id, instructor.id);
    await addTeamMember(db, cls.id, student.id);
    return { org, cls, instructor, student };
  };
  const a = await tenant();
  const b = await tenant();

  const shared = await createUser(db);
  await addMember(db, a.org.id, shared.id, "student");
  await addMember(db, b.org.id, shared.id, "student");
  await addTeamMember(db, a.cls.id, shared.id);
  await addTeamMember(db, b.cls.id, shared.id);

  return { a, b, shared };
}
