import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, id, oneOf, timestamptz, updatedAt } from "./columns";

/*
 * Tenancy, on top of Better Auth's organization plugin with teams enabled:
 *
 *   organization  the tenant: a school, an academy, or an individual instructor
 *   member        a person in an organization, with their tenant role
 *   team          a class (or an individual-lesson pool) inside an organization
 *   team_member   a person assigned to a class
 *
 * The role lives on `member`, not on `team_member` (Better Auth does not allow
 * extra team member fields). Class membership means "teaches this class" for
 * staff and "enrolled in this class" for students.
 */

/**
 * Scale presets chosen at setup. One product, three scales: an individual
 * instructor never sees organization and role management; an academy puts
 * instructors, terms and rankings forward; a school expects many classes and
 * staff roles. The preset only changes defaults and what the UI shows.
 */
export const organizationPresets = ["individual", "academy", "school"] as const;
export type OrganizationPreset = (typeof organizationPresets)[number];

export const organization = pgTable(
  "organization",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    preset: text("preset").$type<OrganizationPreset>().notNull().default("academy"),
    /** Default locale and IANA time zone for members without a preference. */
    defaultLocale: text("default_locale"),
    timeZone: text("time_zone"),
    createdAt: createdAt(),
  },
  (t) => [check("organization_preset_check", oneOf(t.preset, organizationPresets))],
);

/**
 * Tenant roles, from most to least privileged:
 * `owner` and `admin` manage the organization and see every class;
 * `instructor` sees only the classes they are assigned to; `student` learns.
 * Enterprise roles (assistant, guardian, custom roles) extend this list with a
 * migration that replaces the check constraint.
 */
export const memberRoles = ["owner", "admin", "instructor", "student"] as const;
export type MemberRole = (typeof memberRoles)[number];

/**
 * `passive`: the person left (graduated, paused, moved on). They keep their
 * history but cannot act in this organization; their other organizations are
 * unaffected. Blocking someone everywhere is a platform-level ban instead.
 */
export const memberStatuses = ["active", "passive"] as const;
export type MemberStatus = (typeof memberStatuses)[number];

export const member = pgTable(
  "member",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull().default("student"),
    status: text("status").$type<MemberStatus>().notNull().default("active"),
    /** When the membership became passive; retention periods count from here. */
    leftAt: timestamptz("left_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("member_organization_user_idx").on(t.organizationId, t.userId),
    index("member_user_idx").on(t.userId),
    check("member_role_check", oneOf(t.role, memberRoles)),
    check("member_status_check", oneOf(t.status, memberStatuses)),
  ],
);

export const invitationStatuses = ["pending", "accepted", "rejected", "canceled"] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

export const invitation = pgTable(
  "invitation",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<MemberRole>(),
    teamId: uuid("team_id").references(() => team.id, { onDelete: "set null" }),
    status: text("status").$type<InvitationStatus>().notNull().default("pending"),
    expiresAt: timestamptz("expires_at").notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("invitation_organization_idx").on(t.organizationId),
    index("invitation_email_idx").on(t.email),
    check("invitation_role_check", oneOf(t.role, memberRoles)),
    check("invitation_status_check", oneOf(t.status, invitationStatuses)),
  ],
);

/**
 * `class`: a group taught together. `individual`: a pool of one-to-one
 * students, each taught separately.
 */
export const teamKinds = ["class", "individual"] as const;
export type TeamKind = (typeof teamKinds)[number];

export const team = pgTable(
  "team",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<TeamKind>().notNull().default("class"),
    /** `#rrggbb` for the class dot in pickers and lists; derived from the id when null. */
    color: text("color"),
    /** Archived classes keep their history but leave pickers and active lists. */
    archivedAt: timestamptz("archived_at"),
    /** Maintained by Better Auth; not a source of truth for counts. */
    memberCount: integer("member_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("team_organization_idx").on(t.organizationId),
    check("team_kind_check", oneOf(t.kind, teamKinds)),
    check("team_color_check", sql`${t.color} ~ '^#[0-9a-f]{6}$'`),
  ],
);

/**
 * A person assigned to a class. The database guarantees the person is a
 * member of the class's organization (see the `team_member_*` triggers in the
 * migrations): a class can never contain someone from another tenant.
 */
export const teamMember = pgTable(
  "team_member",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Better Auth's idempotency key for team membership writes. */
    membershipKey: text("membership_key").unique(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("team_member_team_user_idx").on(t.teamId, t.userId),
    index("team_member_user_idx").on(t.userId),
  ],
);
