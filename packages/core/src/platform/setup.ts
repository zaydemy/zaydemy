import { schema, type Database } from "@zaydemy/db";
import type { OrganizationPreset } from "@zaydemy/db/schema";
import { sql } from "drizzle-orm";

export interface SetupInput {
  name: string;
  email: string;
  organizationName: string;
  preset: OrganizationPreset;
  locale?: string;
  timeZone?: string;
}

export type SetupResult =
  { status: "created"; userId: string; organizationId: string } | { status: "already-set-up" };

// Arbitrary constant identifying the setup lock among advisory locks.
const setupLockKey = 7_203_418;

/** An IANA time zone the runtime knows, e.g. `Europe/Istanbul`. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** First run: no account exists yet, so nobody could sign in. */
export async function isSetupRequired(db: Database): Promise<boolean> {
  const [existing] = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
  return !existing;
}

/** Lowercase ASCII slug; Turkish and other accented letters are transliterated. */
export function slugify(value: string): string {
  const slug = value
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "organization";
}

/**
 * Creates the first account (platform admin, verified email), the first
 * organization and the owner membership, in one transaction.
 *
 * Only ever succeeds once: an advisory lock serializes concurrent attempts
 * (two browser tabs, the web wizard and the CLI), and the "no users yet" check
 * runs inside the lock. After that, accounts come from invitations.
 */
export async function completeSetup(db: Database, input: SetupInput): Promise<SetupResult> {
  const timeZone = input.timeZone && isTimeZone(input.timeZone) ? input.timeZone : undefined;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${setupLockKey})`);
    const [existing] = await tx.select({ id: schema.user.id }).from(schema.user).limit(1);
    if (existing) return { status: "already-set-up" };

    const [user] = await tx
      .insert(schema.user)
      .values({
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        emailVerified: true,
        platformRole: "admin",
        locale: input.locale,
      })
      .returning({ id: schema.user.id });

    const [organization] = await tx
      .insert(schema.organization)
      .values({
        name: input.organizationName.trim(),
        slug: slugify(input.organizationName),
        preset: input.preset,
        defaultLocale: input.locale,
        // The organization's zone; people follow it until they choose their own.
        timeZone,
      })
      .returning({ id: schema.organization.id });

    await tx
      .insert(schema.member)
      .values({ organizationId: organization!.id, userId: user!.id, role: "owner" });

    return { status: "created", userId: user!.id, organizationId: organization!.id };
  });
}
