import { boolean, check, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, timestamptz, updatedAt } from "./columns";
import { organization, team } from "./tenancy";

/*
 * Better Auth core and plugin tables (admin, passkey, organization + teams).
 * Field names follow what Better Auth expects; regenerate with the Better Auth
 * CLI and diff before changing them. Deliberate differences from the generated
 * schema: uuid keys, timestamptz everywhere, check constraints, and the extra
 * columns documented below.
 */

/**
 * Platform roles, separate from tenant roles (`member.role`).
 * `admin` operates the instance itself (all organizations); everyone else is
 * `user` and gets their permissions from organization membership.
 */
export const platformRoles = ["admin", "user"] as const;
export type PlatformRole = (typeof platformRoles)[number];

export const user = pgTable(
  "user",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    /** Better Auth admin plugin's `role` field, mapped to this column. */
    platformRole: text("platform_role").$type<PlatformRole>().notNull().default("user"),
    banned: boolean("banned").notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: timestamptz("ban_expires"),
    /**
     * Preferred locale and IANA time zone. Not constrained to the shipped
     * locales: removing a locale must not invalidate rows, and locale
     * resolution skips values it does not support.
     */
    locale: text("locale"),
    timeZone: text("time_zone"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("user_platform_role_check", oneOf(t.platformRole, platformRoles))],
);

export const session = pgTable(
  "session",
  {
    id: id(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** Admin plugin: set while a platform admin views the app as this user. */
    impersonatedBy: uuid("impersonated_by").references(() => user.id, { onDelete: "set null" }),
    /**
     * Organization and class picked in the UI. A filter, never a permission:
     * access is always checked against membership.
     */
    activeOrganizationId: uuid("active_organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    activeTeamId: uuid("active_team_id").references(() => team.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/**
 * WebAuthn credentials. Only a public key is stored: biometric data never
 * leaves the user's device.
 */
export const passkey = pgTable(
  "passkey",
  {
    id: id(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: createdAt(),
  },
  (t) => [
    index("passkey_user_idx").on(t.userId),
    index("passkey_credential_idx").on(t.credentialID),
  ],
);
