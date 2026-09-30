import { schema, type Executor } from "@zaydemy/db";
import { eq } from "drizzle-orm";

export interface ProfileUpdate {
  name?: string;
  /** A supported locale, or `null` to follow the organization and browser. */
  locale?: string | null;
}

export type ProfileUpdateResult = { status: "updated" } | { status: "invalid-name" };

/**
 * Updates the signed-in user's own profile. Identity is global (not tenant
 * data), so this runs on the owner connection; callers pass the session's
 * user id, never one taken from the request.
 */
export async function updateOwnProfile(
  db: Executor,
  userId: string,
  update: ProfileUpdate,
): Promise<ProfileUpdateResult> {
  const values: Partial<typeof schema.user.$inferInsert> = {};
  if (update.name !== undefined) {
    const name = update.name.trim().slice(0, 80);
    if (!name) return { status: "invalid-name" };
    values.name = name;
  }
  if (update.locale !== undefined) values.locale = update.locale;
  if (Object.keys(values).length > 0) {
    await db.update(schema.user).set(values).where(eq(schema.user.id, userId));
  }
  return { status: "updated" };
}
