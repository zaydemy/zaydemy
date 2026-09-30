import { schema } from "@zaydemy/db";
import {
  addMember,
  addTeamMember,
  createTeam,
  createTwoTenants,
  createUser,
  useTestDatabase,
  type Transaction,
} from "@zaydemy/db/testing";
import type { MemberRole } from "@zaydemy/db/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { NotAMemberError, resolveTenantContext } from "../tenancy/context";
import { withTenant, type TenantTransaction } from "../tenancy/with-tenant";
import {
  createClass,
  deleteClass,
  getClassRoster,
  listClassOverview,
  normalizeColor,
  setClassArchived,
  updateClass,
} from "./classes";
import {
  addPerson,
  addToClass,
  listPeople,
  removeFromClass,
  removeMembers,
  setMemberRole,
  setMemberStatus,
} from "./people";

const database = useTestDatabase();

/** Tenant A with an owner, an admin, two instructors (each with a class) and students. */
async function academy(tx: Transaction) {
  const { a, b } = await createTwoTenants(tx);
  const person = async (role: MemberRole) => {
    const u = await createUser(tx);
    await addMember(tx, a.org.id, u.id, role);
    return u;
  };
  const owner = await person("owner");
  const admin = await person("admin");
  const otherInstructor = await person("instructor");
  const otherClass = await createTeam(tx, a.org.id, { name: "Other class" });
  await addTeamMember(tx, otherClass.id, otherInstructor.id);
  const otherStudent = await person("student");
  await addTeamMember(tx, otherClass.id, otherStudent.id);
  // From createTwoTenants: a.instructor teaches a.cls with a.student.
  return {
    a,
    b,
    owner,
    admin,
    instructor: a.instructor,
    student: a.student,
    otherInstructor,
    otherClass,
    otherStudent,
  };
}

async function as<T>(
  tx: Transaction,
  userId: string,
  organizationId: string,
  fn: (t: TenantTransaction) => Promise<T>,
) {
  const context = await resolveTenantContext(tx, { userId, organizationId });
  return withTenant(tx, context, fn);
}

describe("classes", () => {
  it("normalizes colours", () => {
    expect(normalizeColor("#ABC")).toBe("#aabbcc");
    expect(normalizeColor("12ab9F")).toBe("#12ab9f");
    expect(normalizeColor("red")).toBeNull();
  });

  it("lets owners and admins create, edit, archive and delete; nobody else", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const created = await as(tx, s.admin.id, s.a.org.id, (t) =>
        createClass(t, { name: "  New   class ", color: "#F0A" }),
      );
      expect(created.status).toBe("created");
      const id = created.status === "created" ? created.id : "";
      const [row] = await tx.select().from(schema.team).where(eq(schema.team.id, id));
      expect(row).toMatchObject({
        name: "New class",
        color: "#ff00aa",
        organizationId: s.a.org.id,
      });

      for (const actor of [s.instructor, s.student]) {
        await expect(
          as(tx, actor.id, s.a.org.id, (t) => createClass(t, { name: "x" })),
        ).resolves.toEqual({ status: "forbidden" });
        await expect(
          as(tx, actor.id, s.a.org.id, (t) => setClassArchived(t, id, true)),
        ).resolves.toEqual({ status: "forbidden" });
      }

      expect(
        await as(tx, s.owner.id, s.a.org.id, (t) =>
          updateClass(t, id, { name: "Renamed", color: null }),
        ),
      ).toEqual({ status: "ok" });
      expect(
        await as(tx, s.owner.id, s.a.org.id, (t) => updateClass(t, id, { color: "blue" })),
      ).toEqual({ status: "invalid-color" });
      expect(await as(tx, s.owner.id, s.a.org.id, (t) => setClassArchived(t, id, true))).toEqual({
        status: "ok",
      });
      expect(await as(tx, s.owner.id, s.a.org.id, (t) => deleteClass(t, id))).toEqual({
        status: "ok",
      });
    }));

  it("cannot touch another tenant's class, even as owner", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      expect(
        await as(tx, s.owner.id, s.a.org.id, (t) => updateClass(t, s.b.cls.id, { name: "hijack" })),
      ).toEqual({ status: "not-found" });
      expect(
        await as(tx, s.owner.id, s.a.org.id, (t) => deleteClass(t, s.b.cls.id, { force: true })),
      ).toEqual({ status: "not-found" });
    }));

  it("refuses to delete a class with members unless forced", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      expect(await as(tx, s.owner.id, s.a.org.id, (t) => deleteClass(t, s.a.cls.id))).toEqual({
        status: "not-empty",
        members: 3,
      });
      expect(
        await as(tx, s.owner.id, s.a.org.id, (t) => deleteClass(t, s.a.cls.id, { force: true })),
      ).toEqual({ status: "ok" });
      // People stay in the organization.
      const [still] = await tx
        .select()
        .from(schema.member)
        .where(eq(schema.member.userId, s.student.id));
      expect(still?.organizationId).toBe(s.a.org.id);
    }));
});

describe("class overview and roster", () => {
  it("counts active instructors and students per accessible class", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const owner = await as(tx, s.owner.id, s.a.org.id, (t) => listClassOverview(t));
      expect(owner.find((c) => c.id === s.a.cls.id)).toMatchObject({ instructors: 1, students: 2 });
      expect(owner.find((c) => c.id === s.otherClass.id)).toMatchObject({
        instructors: 1,
        students: 1,
      });
      const instructor = await as(tx, s.instructor.id, s.a.org.id, (t) => listClassOverview(t));
      expect(instructor.map((c) => c.id)).toEqual([s.a.cls.id]);
    }));

  it("shows a roster to staff with access to the class only", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const roster = await as(tx, s.instructor.id, s.a.org.id, (t) =>
        getClassRoster(t, s.a.cls.id),
      );
      expect(roster.status === "ok" && roster.roster.members.map((m) => m.userId)).toContain(
        s.student.id,
      );
      expect(
        await as(tx, s.instructor.id, s.a.org.id, (t) => getClassRoster(t, s.otherClass.id)),
      ).toEqual({ status: "not-found" });
      expect(await as(tx, s.student.id, s.a.org.id, (t) => getClassRoster(t, s.a.cls.id))).toEqual({
        status: "forbidden",
      });
      expect(await as(tx, s.owner.id, s.a.org.id, (t) => getClassRoster(t, s.b.cls.id))).toEqual({
        status: "not-found",
      });
    }));
});

describe("listing people", () => {
  it("shows owners and admins everyone, instructors their students, students nothing", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const names = async (userId: string) => {
        const result = await as(tx, userId, s.a.org.id, (t) => listPeople(t));
        return result.status === "ok" ? result.people.map((p) => p.userId).sort() : result.status;
      };

      const everyone = await names(s.owner.id);
      expect(everyone).toHaveLength(7); // owner, admin, two instructors, two students, the person shared with B
      expect(await names(s.admin.id)).toEqual(everyone);
      // a.instructor teaches a.cls: a.student and the person shared with tenant B.
      const shared = (
        await tx.select().from(schema.member).where(eq(schema.member.organizationId, s.a.org.id))
      )
        .map((m) => m.userId)
        .filter(
          (id) =>
            ![
              s.owner.id,
              s.admin.id,
              s.instructor.id,
              s.student.id,
              s.otherInstructor.id,
              s.otherStudent.id,
            ].includes(id),
        );
      expect(await names(s.instructor.id)).toEqual([s.student.id, ...shared].sort());
      expect(await names(s.student.id)).toBe("forbidden");
    }));

  it("filters by role, status and class, and reports class assignments", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const result = await as(tx, s.owner.id, s.a.org.id, (t) =>
        listPeople(t, { classId: s.otherClass.id }),
      );
      expect(result.status === "ok" && result.people.map((p) => [p.userId, p.classIds])).toEqual(
        expect.arrayContaining([[s.otherStudent.id, [s.otherClass.id]]]),
      );
      const staff = await as(tx, s.owner.id, s.a.org.id, (t) =>
        listPeople(t, { role: "instructor" }),
      );
      expect(staff.status === "ok" && staff.people.map((p) => p.userId).sort()).toEqual(
        [s.instructor.id, s.otherInstructor.id].sort(),
      );
    }));
});

describe("adding people", () => {
  it("creates an account for a new address and a membership with classes", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const context = await resolveTenantContext(tx, {
        userId: s.admin.id,
        organizationId: s.a.org.id,
      });
      const result = await addPerson(tx as never, context, {
        name: " Ada  Lovelace ",
        email: " ADA@Example.com ",
        role: "student",
        classIds: [s.a.cls.id],
      });
      expect(result).toMatchObject({
        status: "added",
        newAccount: true,
        name: "Ada Lovelace",
        email: "ada@example.com",
      });
      const userId = result.status === "added" ? result.userId : "";
      const [m] = await tx.select().from(schema.member).where(eq(schema.member.userId, userId));
      expect(m).toMatchObject({ organizationId: s.a.org.id, role: "student", status: "active" });
      const classes = await tx
        .select()
        .from(schema.teamMember)
        .where(eq(schema.teamMember.userId, userId));
      expect(classes.map((c) => c.teamId)).toEqual([s.a.cls.id]);
    }));

  it("reuses the account of someone who belongs to another organization", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const context = await resolveTenantContext(tx, {
        userId: s.owner.id,
        organizationId: s.a.org.id,
      });
      const result = await addPerson(tx as never, context, {
        name: "Whatever",
        email: s.b.student.email,
        role: "student",
      });
      expect(result).toMatchObject({
        status: "added",
        newAccount: false,
        userId: s.b.student.id,
        name: s.b.student.name,
      });
      expect(
        await tx.select().from(schema.member).where(eq(schema.member.userId, s.b.student.id)),
      ).toHaveLength(2);
    }));

  it("refuses duplicates, bad input, other tenants' classes and roles above the actor", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const admin = await resolveTenantContext(tx, {
        userId: s.admin.id,
        organizationId: s.a.org.id,
      });
      const add = (input: Parameters<typeof addPerson>[2]) => addPerson(tx as never, admin, input);
      expect(await add({ name: "x", email: s.student.email, role: "student" })).toEqual({
        status: "already-member",
      });
      expect(await add({ name: " ", email: "n@example.com", role: "student" })).toEqual({
        status: "invalid-name",
      });
      expect(await add({ name: "N", email: "nope", role: "student" })).toEqual({
        status: "invalid-email",
      });
      expect(
        await add({ name: "N", email: "n@example.com", role: "student", classIds: [s.b.cls.id] }),
      ).toEqual({
        status: "invalid-class",
      });
      expect(await add({ name: "N", email: "n@example.com", role: "admin" })).toEqual({
        status: "forbidden",
      });
      // Nothing was created by the refused attempts.
      expect(
        await tx.select().from(schema.user).where(eq(schema.user.email, "n@example.com")),
      ).toEqual([]);
    }));

  it("lets instructors add students only into classes they teach", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const instructor = await resolveTenantContext(tx, {
        userId: s.instructor.id,
        organizationId: s.a.org.id,
      });
      const add = (input: Parameters<typeof addPerson>[2]) =>
        addPerson(tx as never, instructor, input);
      expect(
        (await add({ name: "S", email: "s1@example.com", role: "student", classIds: [s.a.cls.id] }))
          .status,
      ).toBe("added");
      expect(
        await add({
          name: "S",
          email: "s2@example.com",
          role: "student",
          classIds: [s.otherClass.id],
        }),
      ).toEqual({ status: "forbidden" });
      expect(await add({ name: "S", email: "s3@example.com", role: "student" })).toEqual({
        status: "forbidden",
      });
      expect(
        await add({
          name: "S",
          email: "s4@example.com",
          role: "instructor",
          classIds: [s.a.cls.id],
        }),
      ).toEqual({ status: "forbidden" });
    }));
});

describe("managing people", () => {
  it("follows the role table and never lets people change themselves", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const role = (actor: string, target: string, next: MemberRole) =>
        as(tx, actor, s.a.org.id, (t) => setMemberRole(t, target, next));

      expect(await role(s.admin.id, s.student.id, "instructor")).toEqual({ status: "ok" });
      expect(await role(s.admin.id, s.owner.id, "student")).toEqual({ status: "forbidden" });
      expect(await role(s.admin.id, s.student.id, "admin")).toEqual({ status: "forbidden" });
      expect(await role(s.owner.id, s.admin.id, "owner")).toEqual({ status: "ok" });
      expect(await role(s.owner.id, s.owner.id, "student")).toEqual({ status: "forbidden" });
      expect(await role(s.instructor.id, s.otherStudent.id, "instructor")).toEqual({
        status: "forbidden",
      });
      expect(await role(s.owner.id, s.b.student.id, "student")).toEqual({ status: "not-found" });
    }));

  it("makes members passive: they keep history, lose access here, and keep other organizations", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      const shared = (await createTwoTenants(tx)).shared;
      await addMember(tx, s.a.org.id, shared.id, "student");
      await addTeamMember(tx, s.a.cls.id, shared.id);

      expect(
        await as(tx, s.instructor.id, s.a.org.id, (t) =>
          setMemberStatus(t, [shared.id], "passive"),
        ),
      ).toEqual({ status: "ok" });
      const [m] = await tx
        .select()
        .from(schema.member)
        .where(
          and(eq(schema.member.userId, shared.id), eq(schema.member.organizationId, s.a.org.id)),
        );
      expect(m?.status).toBe("passive");
      expect(m?.leftAt).toBeInstanceOf(Date);

      await expect(
        resolveTenantContext(tx, { userId: shared.id, organizationId: s.a.org.id }),
      ).rejects.toMatchObject({
        name: "NotAMemberError",
        reason: "passive",
      });
      // Still a member elsewhere.
      const other = (
        await tx.select().from(schema.member).where(eq(schema.member.userId, shared.id))
      ).find((row) => row.organizationId !== s.a.org.id);
      await expect(
        resolveTenantContext(tx, { userId: shared.id, organizationId: other!.organizationId }),
      ).resolves.toBeTruthy();

      // Instructors cannot touch students outside their classes.
      expect(
        await as(tx, s.instructor.id, s.a.org.id, (t) =>
          setMemberStatus(t, [s.otherStudent.id], "passive"),
        ),
      ).toEqual({
        status: "forbidden",
      });
      // Reactivating clears the departure date.
      await as(tx, s.owner.id, s.a.org.id, (t) => setMemberStatus(t, [shared.id], "active"));
      const [back] = await tx
        .select()
        .from(schema.member)
        .where(
          and(eq(schema.member.userId, shared.id), eq(schema.member.organizationId, s.a.org.id)),
        );
      expect(back).toMatchObject({ status: "active", leftAt: null });
    }));

  it("lets only owners and admins remove members, never themselves", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      expect(
        await as(tx, s.instructor.id, s.a.org.id, (t) => removeMembers(t, [s.student.id])),
      ).toEqual({ status: "forbidden" });
      expect(await as(tx, s.admin.id, s.a.org.id, (t) => removeMembers(t, [s.admin.id]))).toEqual({
        status: "forbidden",
      });
      expect(await as(tx, s.admin.id, s.a.org.id, (t) => removeMembers(t, [s.student.id]))).toEqual(
        { status: "ok" },
      );
      expect(
        await tx.select().from(schema.teamMember).where(eq(schema.teamMember.userId, s.student.id)),
      ).toEqual([]);
      expect(
        await tx.select().from(schema.user).where(eq(schema.user.id, s.student.id)),
      ).toHaveLength(1);
    }));

  it("moves students between classes within the actor's reach", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      // Instructor: own class, students only.
      expect(
        await as(tx, s.instructor.id, s.a.org.id, (t) =>
          addToClass(t, [s.otherStudent.id], s.a.cls.id),
        ),
      ).toEqual({ status: "ok" });
      expect(
        await as(tx, s.instructor.id, s.a.org.id, (t) =>
          addToClass(t, [s.student.id], s.otherClass.id),
        ),
      ).toEqual({
        status: "forbidden",
      });
      expect(
        await as(tx, s.instructor.id, s.a.org.id, (t) =>
          addToClass(t, [s.otherInstructor.id], s.a.cls.id),
        ),
      ).toEqual({
        status: "forbidden",
      });
      // Owners assign staff too; adding twice is harmless.
      expect(
        await as(tx, s.owner.id, s.a.org.id, (t) =>
          addToClass(t, [s.otherInstructor.id, s.otherInstructor.id], s.a.cls.id),
        ),
      ).toEqual({
        status: "ok",
      });
      // Someone from another tenant cannot be put in a class here.
      expect(
        await as(tx, s.owner.id, s.a.org.id, (t) => addToClass(t, [s.b.student.id], s.a.cls.id)),
      ).toEqual({ status: "not-found" });

      expect(
        await as(tx, s.instructor.id, s.a.org.id, (t) =>
          removeFromClass(t, [s.otherStudent.id], s.a.cls.id),
        ),
      ).toEqual({ status: "ok" });
      const remaining = await tx
        .select()
        .from(schema.teamMember)
        .where(eq(schema.teamMember.userId, s.otherStudent.id));
      expect(remaining.map((r) => r.teamId)).toEqual([s.otherClass.id]);
    }));
});

describe("tenant context", () => {
  it("rejects passive members like non-members", () =>
    database.rollback(async (tx) => {
      const s = await academy(tx);
      await tx
        .update(schema.member)
        .set({ status: "passive" })
        .where(eq(schema.member.userId, s.student.id));
      await expect(
        resolveTenantContext(tx, { userId: s.student.id, organizationId: s.a.org.id }),
      ).rejects.toBeInstanceOf(NotAMemberError);
    }));
});
