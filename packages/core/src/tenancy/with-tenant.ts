import { appRole, type Executor, type Transaction } from "@zaydemy/db";
import { sql } from "drizzle-orm";
import type { TenantContext } from "./context";

declare const tenantScoped: unique symbol;

/**
 * A transaction running as the row-level-security role with a tenant set.
 * Tenant data functions take this type instead of a database handle, so they
 * cannot be called outside `withTenant`.
 */
export type TenantTransaction = Transaction & { readonly [tenantScoped]: true };

const contexts = new WeakMap<object, TenantContext>();

/** The context a tenant transaction was opened with. */
export function contextOf(tx: TenantTransaction): TenantContext {
  const context = contexts.get(tx);
  if (!context) throw new Error("Not a tenant transaction.");
  return context;
}

/**
 * Runs `fn` in a transaction scoped to `context.organizationId`: it switches to
 * the row-level-security role and records the user and tenant, so Postgres
 * itself rejects rows of other tenants, whatever the query looks like.
 *
 * Inside an open transaction (tests) it uses a savepoint and restores the
 * caller's role and settings afterwards.
 */
export async function withTenant<T>(
  db: Executor,
  context: TenantContext,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role ${sql.identifier(appRole)}`);
    await tx.execute(
      sql`select set_config('app.user_id', ${context.userId}, true),
                 set_config('app.organization_id', ${context.organizationId}, true)`,
    );

    const scoped = tx as TenantTransaction;
    contexts.set(scoped, context);
    const result = await fn(scoped);

    // Only matters when nested in an outer transaction: SET LOCAL outlives a
    // released savepoint. On error the savepoint rollback undoes it anyway.
    await tx.execute(sql`reset role`);
    await tx.execute(
      sql`select set_config('app.user_id', '', true), set_config('app.organization_id', '', true)`,
    );
    return result;
  });
}
