import { schema, type Database } from "@zaydemy/db";
import { and, eq } from "drizzle-orm";

export interface LinkedAccount {
  providerId: string;
  /** The provider's id for the account (for GitHub, the numeric user id). */
  accountId: string;
  linkedAt: Date;
}

/** Social accounts linked to a user (GitHub today). */
export async function listLinkedAccounts(db: Database, userId: string): Promise<LinkedAccount[]> {
  return db
    .select({
      providerId: schema.account.providerId,
      accountId: schema.account.accountId,
      linkedAt: schema.account.createdAt,
    })
    .from(schema.account)
    .where(eq(schema.account.userId, userId));
}

/**
 * Removes a linked provider account, and its tokens with it.
 *
 * Not Better Auth's `unlinkAccount`: that refuses to remove a user's last
 * account, but here sign-in by email code needs no account row, so a linked
 * GitHub account can be the only one and must still be removable.
 */
export async function unlinkProvider(
  db: Database,
  userId: string,
  providerId: "github",
): Promise<void> {
  await db
    .delete(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, providerId)));
}
