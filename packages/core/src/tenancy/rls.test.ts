import { appRole, schema } from "@zaydemy/db";
import { createTwoTenants, useTestDatabase, type Transaction } from "@zaydemy/db/testing";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { resolveTenantContext } from "./context";
import { withTenant } from "./with-tenant";

/*
 * The database-side tenant boundary. These tests query tables directly,
 * without any tenant filter, as a forgetful query would: row level security
 * alone must keep tenant B out of tenant A's transaction.
 */

const database = useTestDatabase();

async function actAs(tx: Transaction, userId: string, organizationId: string) {
  const context = await resolveTenantContext(tx, { userId, organizationId });
  return <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(tx, context, fn);
}

/** SQLSTATE of a statement that must fail, run in a savepoint so the test can continue. */
async function sqlState(tx: Transaction, statement: (sp: Transaction) => Promise<unknown>) {
  try {
    await tx.transaction(async (sp) => {
      await statement(sp);
    });
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
  throw new Error("Expected the statement to fail.");
}

const insufficientPrivilege = "42501";
const integrityConstraintViolation = "23000";

describe("row level security", () => {
  it("shows only the current tenant's rows to unfiltered queries", () =>
    database.rollback(async (tx) => {
      const { a, b, shared } = await createTwoTenants(tx);
      const inA = await actAs(tx, a.instructor.id, a.org.id);

      await inA(async (t) => {
        const orgs = await t.select({ id: schema.organization.id }).from(schema.organization);
        expect(orgs).toEqual([{ id: a.org.id }]);

        const teams = await t.select({ id: schema.team.id }).from(schema.team);
        expect(teams).toEqual([{ id: a.cls.id }]);

        const members = await t
          .select({ organizationId: schema.member.organizationId })
          .from(schema.member);
        expect(members).toHaveLength(3);
        expect(members.every((m) => m.organizationId === a.org.id)).toBe(true);

        const classMembers = await t
          .select({ teamId: schema.teamMember.teamId })
          .from(schema.teamMember);
        expect(classMembers).toHaveLength(3);
        expect(classMembers.every((m) => m.teamId === a.cls.id)).toBe(true);

        // People: A's members, including the person who is also in B; nobody only in B.
        const people = (await t.select({ id: schema.user.id }).from(schema.user)).map((u) => u.id);
        expect(people.sort()).toEqual([a.instructor.id, a.student.id, shared.id].sort());
        expect(people).not.toContain(b.instructor.id);
      });
    }));

  it("rejects writing rows into another tenant", () =>
    database.rollback(async (tx) => {
      const { a, b } = await createTwoTenants(tx);
      const inA = await actAs(tx, a.instructor.id, a.org.id);

      await inA(async (t) => {
        await expect(
          sqlState(t, (sp) =>
            sp.insert(schema.team).values({ organizationId: b.org.id, name: "x" }),
          ),
        ).resolves.toBe(insufficientPrivilege);

        const renamed = await t
          .update(schema.team)
          .set({ name: "taken over" })
          .where(eq(schema.team.id, b.cls.id))
          .returning();
        expect(renamed).toEqual([]);

        const removed = await t
          .delete(schema.member)
          .where(eq(schema.member.organizationId, b.org.id))
          .returning();
        expect(removed).toEqual([]);
      });

      const [bClass] = await tx.select().from(schema.team).where(eq(schema.team.id, b.cls.id));
      expect(bClass?.name).toBe(b.cls.name);
    }));

  it("sees nothing when no tenant is set", () =>
    database.rollback(async (tx) => {
      await createTwoTenants(tx);
      await tx.transaction(async (sp) => {
        await sp.execute(sql`set local role ${sql.identifier(appRole)}`);
        expect(await sp.select().from(schema.organization)).toEqual([]);
        expect(await sp.select().from(schema.team)).toEqual([]);
        expect(await sp.select().from(schema.member)).toEqual([]);
        expect(await sp.select().from(schema.user)).toEqual([]);
        await sp.execute(sql`reset role`);
      });
    }));

  it("keeps authentication tables out of reach", () =>
    database.rollback(async (tx) => {
      const { a } = await createTwoTenants(tx);
      const inA = await actAs(tx, a.instructor.id, a.org.id);

      await inA(async (t) => {
        for (const table of [schema.session, schema.account, schema.verification, schema.passkey]) {
          await expect(sqlState(t, (sp) => sp.select().from(table))).resolves.toBe(
            insufficientPrivilege,
          );
        }
      });
    }));

  it("lets users edit their own profile but not their platform role or anyone else", () =>
    database.rollback(async (tx) => {
      const { a } = await createTwoTenants(tx);
      const inA = await actAs(tx, a.student.id, a.org.id);

      await inA(async (t) => {
        const [self] = await t
          .update(schema.user)
          .set({ name: "Renamed" })
          .where(eq(schema.user.id, a.student.id))
          .returning({ name: schema.user.name });
        expect(self?.name).toBe("Renamed");

        const other = await t
          .update(schema.user)
          .set({ name: "Hijacked" })
          .where(eq(schema.user.id, a.instructor.id))
          .returning();
        expect(other).toEqual([]);

        await expect(
          sqlState(t, (sp) =>
            sp
              .update(schema.user)
              .set({ platformRole: "admin" })
              .where(eq(schema.user.id, a.student.id)),
          ),
        ).resolves.toBe(insufficientPrivilege);
      });
    }));

  it("keeps the class membership rule working under the app role", () =>
    database.rollback(async (tx) => {
      const { a, b } = await createTwoTenants(tx);
      const inA = await actAs(tx, a.instructor.id, a.org.id);

      await inA(async (t) => {
        await expect(
          sqlState(t, (sp) =>
            sp.insert(schema.teamMember).values({ teamId: a.cls.id, userId: b.student.id }),
          ),
        ).resolves.toBe(integrityConstraintViolation);
      });
    }));

  it("restores the caller's role after a nested tenant transaction", () =>
    database.rollback(async (tx) => {
      const { a } = await createTwoTenants(tx);
      const inA = await actAs(tx, a.instructor.id, a.org.id);
      const before = await tx.execute<{ role: string }>(sql`select current_user as role`);

      await inA(async () => {});

      const after = await tx.execute<{ role: string; org: string }>(
        sql`select current_user as role, current_setting('app.organization_id', true) as org`,
      );
      expect(after[0]?.role).toBe(before[0]?.role);
      expect(after[0]?.org ?? "").toBe("");
    }));
});
