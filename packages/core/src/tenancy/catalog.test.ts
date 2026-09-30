import { appRole } from "@zaydemy/db";
import { useTestDatabase } from "@zaydemy/db/testing";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

/*
 * Guards against the most likely future leak: a new table the app role can
 * read, but without row level security. Every table granted to the app role
 * must have RLS enabled and at least one policy, and the list of such tables
 * changes only on purpose.
 */

const database = useTestDatabase();

const tenantTables = ["invitation", "member", "organization", "team", "team_member", "user"];

describe("database catalog", () => {
  it("protects every table the app role can access with row level security", async () => {
    const rows = await database.db.execute<{
      table: string;
      rls: boolean;
      policies: number;
    }>(sql`
      select c.relname as table,
             c.relrowsecurity as rls,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind in ('r', 'p', 'v', 'm')
         and (
           has_table_privilege(${appRole}, c.oid, 'select, insert, update, delete')
           or exists (
             select 1 from pg_attribute a
              where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                and has_column_privilege(${appRole}, c.oid, a.attnum, 'select, insert, update')
           )
         )
       order by c.relname
    `);

    expect(rows.map((r) => r.table)).toEqual(tenantTables);
    for (const row of rows) {
      expect({ table: row.table, rls: row.rls }).toEqual({ table: row.table, rls: true });
      expect(row.policies, `${row.table} has no policy`).toBeGreaterThan(0);
    }
  });

  it("does not let the app role bypass row level security or own tables", async () => {
    const [role] = await database.db.execute<{ bypass: boolean; superuser: boolean }>(
      sql`select rolbypassrls as bypass, rolsuper as superuser from pg_roles where rolname = ${appRole}`,
    );
    expect(role).toEqual({ bypass: false, superuser: false });

    const owned = await database.db.execute(sql`
      select c.relname from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and pg_get_userbyid(c.relowner) = ${appRole}
    `);
    expect(owned).toHaveLength(0);
  });
});
