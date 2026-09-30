# @zaydemy/db

Drizzle schema, migrations and the database test harness.

## Tenancy model

| Table          | Meaning                                                           |
| -------------- | ----------------------------------------------------------------- |
| `organization` | The tenant: a school, an academy or an individual instructor      |
| `member`       | A person in an organization, with their tenant role               |
| `team`         | A class (or a pool of one-to-one students) inside an organization |
| `team_member`  | A person assigned to a class                                      |

`user.platform_role` (`admin` / `user`) is about the instance; `member.role`
(`owner` / `admin` / `instructor` / `student`) is about one organization. The
database guarantees that a class only contains members of its organization and
that rows never move between organizations (`migrations/0001_tenant_integrity.sql`).

## Commands

```sh
pnpm db:generate   # create a migration from schema changes
pnpm db:migrate    # apply pending migrations to DATABASE_URL
pnpm db:check      # fail if the schema changed without a migration (CI)
```

## Migration rules

- **No Postgres enums.** Use `text` + a check constraint (`oneOf` in
  `src/schema/columns.ts`). `ALTER TYPE ... ADD VALUE` cannot be used in the
  transaction that adds it, and migrations run in a single transaction.
- **Irreversible changes take two releases.** First stop reading the column (keep
  writing it for one more release, so a rollback still sees consistent data),
  then drop it in a separate migration.
- **Schema and data migrations are separate.** A migration that rewrites rows is
  its own file, never mixed with DDL.
- **Hand-written SQL** (triggers, functions, policies) goes in a custom
  migration: `pnpm --filter @zaydemy/db exec drizzle-kit generate --custom --name <name>`.
- Migrations run as their own deployment step, never during a build and never
  from a web process.

## Tests

Tests need a Postgres server where the test role can create databases
(`TEST_DATABASE_URL`). Each run migrates a template database once; each test
file clones it, and `rollback` runs a test inside a transaction that is always
rolled back:

```ts
import { createTwoTenants, useTestDatabase } from "@zaydemy/db/testing";

const database = useTestDatabase();

it("keeps tenants apart", () =>
  database.rollback(async (tx) => {
    const { a, b } = await createTwoTenants(tx);
    // ...
  }));
```

Interrupted runs can leave `zaydemy_test_*` databases behind; runs drop those older
than an hour, and `pnpm --filter @zaydemy/db test:clean` drops them all.

Add `globalSetup: ["@zaydemy/db/testing/global-setup"]` to the package's Vitest config.
