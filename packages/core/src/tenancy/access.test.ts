import {
  addMember,
  addTeamMember,
  createTeam,
  createTwoTenants,
  createUser,
  useTestDatabase,
  type Transaction,
} from "@zaydemy/db/testing";
import { describe, expect, it } from "vitest";
import { canAccessClass, listAccessibleClasses } from "./access";
import { NotAMemberError, resolveTenantContext } from "./context";
import { withTenant } from "./with-tenant";

const database = useTestDatabase();

async function classesOf(tx: Transaction, userId: string, organizationId: string) {
  const context = await resolveTenantContext(tx, { userId, organizationId });
  return withTenant(tx, context, async (t) => (await listAccessibleClasses(t)).map((c) => c.name));
}

async function canAccess(tx: Transaction, userId: string, organizationId: string, teamId: string) {
  const context = await resolveTenantContext(tx, { userId, organizationId });
  return withTenant(tx, context, (t) => canAccessClass(t, teamId));
}

describe("resolveTenantContext", () => {
  it("carries the member's role", () =>
    database.rollback(async (tx) => {
      const { a } = await createTwoTenants(tx);
      const context = await resolveTenantContext(tx, {
        userId: a.instructor.id,
        organizationId: a.org.id,
      });
      expect(context.role).toBe("instructor");
      expect(context.platformRole).toBe("user");
    }));

  it("refuses people from another tenant, including platform admins", () =>
    database.rollback(async (tx) => {
      const { a, b } = await createTwoTenants(tx);
      const admin = await createUser(tx, { platformRole: "admin" });

      for (const userId of [b.instructor.id, admin.id]) {
        await expect(
          resolveTenantContext(tx, { userId, organizationId: a.org.id }),
        ).rejects.toBeInstanceOf(NotAMemberError);
      }
    }));
});

describe("class access", () => {
  /** Tenant A gets a second class the instructor does not teach; a class is archived. */
  async function setup(tx: Transaction) {
    const tenants = await createTwoTenants(tx);
    const { a } = tenants;
    const other = await createTeam(tx, a.org.id, { name: "B other class" });
    const archived = await createTeam(tx, a.org.id, { name: "A archived", archivedAt: new Date() });
    const admin = await createUser(tx);
    await addMember(tx, a.org.id, admin.id, "admin");
    await addTeamMember(tx, archived.id, a.student.id);
    return { ...tenants, other, archived, admin };
  }

  it("shows instructors only the classes they teach", () =>
    database.rollback(async (tx) => {
      const { a, other } = await setup(tx);
      expect(await classesOf(tx, a.instructor.id, a.org.id)).toEqual([a.cls.name]);
      expect(await canAccess(tx, a.instructor.id, a.org.id, other.id)).toBe(false);
      expect(await canAccess(tx, a.instructor.id, a.org.id, a.cls.id)).toBe(true);
    }));

  it("shows students their classes, archived ones last", () =>
    database.rollback(async (tx) => {
      const { a, archived } = await setup(tx);
      expect(await classesOf(tx, a.student.id, a.org.id)).toEqual([a.cls.name, archived.name]);
    }));

  it("shows owners and admins every class of their organization only", () =>
    database.rollback(async (tx) => {
      const { a, b, other, archived, admin } = await setup(tx);
      expect((await classesOf(tx, admin.id, a.org.id)).sort()).toEqual(
        [a.cls.name, other.name, archived.name].sort(),
      );
      // Another tenant's class is out of reach even for an organization admin.
      expect(await canAccess(tx, admin.id, a.org.id, b.cls.id)).toBe(false);
    }));

  it("gives a person in two tenants only the current tenant's classes", () =>
    database.rollback(async (tx) => {
      const { a, b, shared } = await setup(tx);
      expect(await classesOf(tx, shared.id, a.org.id)).toEqual([a.cls.name]);
      expect(await classesOf(tx, shared.id, b.org.id)).toEqual([b.cls.name]);
    }));
});
