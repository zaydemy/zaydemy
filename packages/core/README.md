# @zaydemy/core

Business logic and data access. Framework-free: nothing here imports Next.js,
so everything runs in tests, scripts and background jobs.

## Tenant-scoped data access

Tenant data is only reachable inside `withTenant`:

```ts
const context = await resolveTenantContext(db, { userId, organizationId });
const classes = await withTenant(db, context, (tx) => listAccessibleClasses(tx));
```

- `resolveTenantContext` checks the membership and returns a branded
  `TenantContext`; a hand-built object does not type-check.
- `withTenant` opens a transaction that switches to the `zaydemy_app` role and
  sets `app.user_id` / `app.organization_id`. Postgres row level security then
  rejects other tenants' rows, whatever the query looks like.
- Data functions take a `TenantTransaction`, never a database handle, so they
  cannot be called outside `withTenant`. `contextOf(tx)` returns who is asking.

Authorization rules (who may see which class) live next to the queries and are
tested against a real database with two tenants. Row level security is the
safety net for the tenant boundary, not a replacement for those rules.

## Adding a tenant-scoped table

1. Give it an `organization_id` (or a parent that has one).
2. In a custom migration: `GRANT` only the privileges the app needs to
   `zaydemy_app`, `ENABLE ROW LEVEL SECURITY`, and add a policy.
3. Add the table to the list in `src/tenancy/catalog.test.ts`. That test fails for
   any table the app role can reach without row level security.
