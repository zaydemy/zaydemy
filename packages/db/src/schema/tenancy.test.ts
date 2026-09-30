import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addMember,
  addTeamMember,
  createOrganization,
  createTwoTenants,
  createUser,
  useTestDatabase,
  type Transaction,
} from "../testing";
import { member, organization, team, teamMember, user } from ".";

const database = useTestDatabase();

/**
 * Runs a statement that must fail and returns the violated constraint's name.
 * The statement runs in a savepoint: a failed statement aborts its
 * transaction, and the test's later statements must still run.
 */
async function violation(
  tx: Transaction,
  statement: (sp: Transaction) => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await tx.transaction(async (sp) => {
      await statement(sp);
    });
  } catch (error) {
    const cause = (error as { cause?: { constraint_name?: string } }).cause;
    return cause?.constraint_name;
  }
  throw new Error("Expected the statement to fail.");
}

describe("value constraints", () => {
  it("rejects unknown platform roles, tenant roles and class kinds", () =>
    database.rollback(async (tx) => {
      const org = await createOrganization(tx);
      const person = await createUser(tx);

      await expect(
        violation(tx, (sp) =>
          sp.execute(sql`update ${user} set platform_role = 'root' where id = ${person.id}`),
        ),
      ).resolves.toBe("user_platform_role_check");
      await expect(
        violation(tx, (sp) =>
          sp.execute(sql`insert into ${member} (organization_id, user_id, role)
                         values (${org.id}, ${person.id}, 'superuser')`),
        ),
      ).resolves.toBe("member_role_check");
      await expect(
        violation(tx, (sp) =>
          sp.execute(sql`insert into ${team} (organization_id, name, kind)
                         values (${org.id}, 'x', 'cohort')`),
        ),
      ).resolves.toBe("team_kind_check");
    }));

  it("defaults new users to the plain platform role", () =>
    database.rollback(async (tx) => {
      const person = await createUser(tx);
      expect(person.platformRole).toBe("user");
    }));

  it("allows one membership per person and organization", () =>
    database.rollback(async (tx) => {
      const org = await createOrganization(tx);
      const person = await createUser(tx);
      await addMember(tx, org.id, person.id, "student");
      await expect(
        violation(tx, (sp) => addMember(sp, org.id, person.id, "instructor")),
      ).resolves.toBe("member_organization_user_idx");
    }));
});

describe("class membership", () => {
  it("rejects a person who is not a member of the class's organization", () =>
    database.rollback(async (tx) => {
      const { a, b } = await createTwoTenants(tx);
      await expect(violation(tx, (sp) => addTeamMember(sp, a.cls.id, b.student.id))).resolves.toBe(
        "team_member_requires_membership",
      );
    }));

  it("rejects moving a class membership into another tenant's class", () =>
    database.rollback(async (tx) => {
      const { a, b } = await createTwoTenants(tx);
      await expect(
        violation(tx, (sp) =>
          sp
            .update(teamMember)
            .set({ teamId: b.cls.id })
            .where(and(eq(teamMember.teamId, a.cls.id), eq(teamMember.userId, a.student.id))),
        ),
      ).resolves.toBe("team_member_requires_membership");
    }));

  it("removes class memberships when a person leaves an organization, and only there", () =>
    database.rollback(async (tx) => {
      const { a, b, shared } = await createTwoTenants(tx);
      await tx
        .delete(member)
        .where(and(eq(member.organizationId, a.org.id), eq(member.userId, shared.id)));

      const classes = await tx
        .select({ teamId: teamMember.teamId })
        .from(teamMember)
        .where(eq(teamMember.userId, shared.id));
      expect(classes).toEqual([{ teamId: b.cls.id }]);
    }));

  it("allows one membership per person and class", () =>
    database.rollback(async (tx) => {
      const { a } = await createTwoTenants(tx);
      await expect(violation(tx, (sp) => addTeamMember(sp, a.cls.id, a.student.id))).resolves.toBe(
        "team_member_team_user_idx",
      );
    }));

  it("deletes classes and memberships with their organization", () =>
    database.rollback(async (tx) => {
      const { a, b } = await createTwoTenants(tx);
      await tx.delete(organization).where(eq(organization.id, a.org.id));

      const remaining = await tx.select({ organizationId: team.organizationId }).from(team);
      expect(remaining).toEqual([{ organizationId: b.org.id }]);
      const members = await tx.select().from(member).where(eq(member.organizationId, a.org.id));
      expect(members).toEqual([]);
    }));
});

describe("tenant keys", () => {
  it("cannot move a class or a membership to another organization", () =>
    database.rollback(async (tx) => {
      const { a, b } = await createTwoTenants(tx);

      await expect(
        violation(tx, (sp) =>
          sp.update(team).set({ organizationId: b.org.id }).where(eq(team.id, a.cls.id)),
        ),
      ).resolves.toBe("team_tenant_key_immutable");
      await expect(
        violation(tx, (sp) =>
          sp
            .update(member)
            .set({ organizationId: b.org.id })
            .where(eq(member.userId, a.instructor.id)),
        ),
      ).resolves.toBe("member_tenant_key_immutable");
      await expect(
        violation(tx, (sp) =>
          sp
            .update(member)
            .set({ userId: b.instructor.id })
            .where(eq(member.userId, a.instructor.id)),
        ),
      ).resolves.toBe("member_tenant_key_immutable");
    }));

  it("still allows changing a member's role", () =>
    database.rollback(async (tx) => {
      const { a } = await createTwoTenants(tx);
      const [updated] = await tx
        .update(member)
        .set({ role: "admin" })
        .where(and(eq(member.organizationId, a.org.id), eq(member.userId, a.instructor.id)))
        .returning();
      expect(updated?.role).toBe("admin");
    }));
});

describe("test harness", () => {
  it("rolls back between tests", async () => {
    const rows = await database.db.select().from(organization);
    expect(rows).toEqual([]);
  });
});
