import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, id, oneOf, timestamptz, updatedAt } from "./columns";
import { member, organization, team } from "./tenancy";

/*
 * Curriculum: program → section → lesson, and enrollments that give a program
 * to a class or to one student.
 *
 * Every table carries `organization_id`, and children reference their parent
 * with a composite key (id, organization_id). Row level security then needs
 * only `organization_id = current tenant`, and the database itself refuses a
 * lesson that points at another tenant's program.
 */

const tenant = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const programStatuses = ["draft", "published"] as const;
export type ProgramStatus = (typeof programStatuses)[number];

export const program = pgTable(
  "program",
  {
    id: id(),
    organizationId: tenant(),
    /** URL segment, unique within the organization. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** Students only ever see published programs, even when enrolled. */
    status: text("status").$type<ProgramStatus>().notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("program_id_organization_key").on(t.id, t.organizationId),
    uniqueIndex("program_organization_slug_idx").on(t.organizationId, t.slug),
    check("program_status_check", oneOf(t.status, programStatuses)),
  ],
);

export const section = pgTable(
  "section",
  {
    id: id(),
    organizationId: tenant(),
    programId: uuid("program_id").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
  },
  (t) => [
    unique("section_id_organization_key").on(t.id, t.organizationId),
    foreignKey({
      name: "section_program_fk",
      columns: [t.programId, t.organizationId],
      foreignColumns: [program.id, program.organizationId],
    }).onDelete("cascade"),
    index("section_program_idx").on(t.programId, t.position),
  ],
);

export const lesson = pgTable(
  "lesson",
  {
    id: id(),
    organizationId: tenant(),
    sectionId: uuid("section_id").notNull(),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    /** Lesson note in Markdown; the current version (older ones are revisions). */
    note: text("note"),
    videoUrl: text("video_url"),
    /** Unpublished lessons are invisible to students, whatever their access. */
    published: boolean("published").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("lesson_id_organization_key").on(t.id, t.organizationId),
    foreignKey({
      name: "lesson_section_fk",
      columns: [t.sectionId, t.organizationId],
      foreignColumns: [section.id, section.organizationId],
    }).onDelete("cascade"),
    index("lesson_section_idx").on(t.sectionId, t.position),
    check("lesson_duration_check", sql`${t.durationMinutes} between 0 and 1440`),
  ],
);

/**
 * Previous versions of a lesson note. The current text lives in
 * `lesson.note`; a row here is the text a save replaced. The author is kept
 * as `set null`: content outlives the account that wrote it.
 */
export const lessonNoteRevision = pgTable(
  "lesson_note_revision",
  {
    id: id(),
    organizationId: tenant(),
    lessonId: uuid("lesson_id").notNull(),
    note: text("note").notNull(),
    authorId: uuid("author_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "lesson_note_revision_lesson_fk",
      columns: [t.lessonId, t.organizationId],
      foreignColumns: [lesson.id, lesson.organizationId],
    }).onDelete("cascade"),
    index("lesson_note_revision_lesson_idx").on(t.lessonId, t.createdAt),
  ],
);

/**
 * `open`: every lesson is available; exceptions close individual lessons.
 * `selected`: every lesson is locked; exceptions open individual lessons.
 */
export const accessModes = ["open", "selected"] as const;
export type AccessMode = (typeof accessModes)[number];

/**
 * A program given to a class or to one student (exactly one of the two).
 * A class enrollment also covers students who join the class later.
 *
 * `requires_enrollment_id` is a prerequisite: this program opens once that
 * enrollment is finished. It points at an enrollment, not a program, so two
 * classes can take the same programs in different orders; each enrollment
 * has at most one prerequisite, which makes chains, not graphs. Self
 * references and cycles are rejected in code (see core's prerequisite rules).
 */
export const enrollment = pgTable(
  "enrollment",
  {
    id: id(),
    organizationId: tenant(),
    programId: uuid("program_id").notNull(),
    teamId: uuid("team_id"),
    userId: uuid("user_id"),
    accessMode: text("access_mode").$type<AccessMode>().notNull().default("open"),
    requiresEnrollmentId: uuid("requires_enrollment_id"),
    enrolledAt: timestamptz("enrolled_at").notNull().defaultNow(),
  },
  (t) => [
    unique("enrollment_id_organization_key").on(t.id, t.organizationId),
    foreignKey({
      name: "enrollment_program_fk",
      columns: [t.programId, t.organizationId],
      foreignColumns: [program.id, program.organizationId],
    }).onDelete("cascade"),
    // The target belongs to the same organization: a class of this tenant, or
    // one of its members (removing the member removes their own enrollments).
    foreignKey({
      name: "enrollment_team_fk",
      columns: [t.teamId, t.organizationId],
      foreignColumns: [team.id, team.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "enrollment_member_fk",
      columns: [t.organizationId, t.userId],
      foreignColumns: [member.organizationId, member.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "enrollment_requires_fk",
      columns: [t.requiresEnrollmentId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    uniqueIndex("enrollment_team_program_idx")
      .on(t.teamId, t.programId)
      .where(sql`${t.teamId} is not null`),
    uniqueIndex("enrollment_user_program_idx")
      .on(t.userId, t.programId)
      .where(sql`${t.userId} is not null`),
    index("enrollment_program_idx").on(t.programId),
    check("enrollment_single_target_check", sql`num_nonnulls(${t.teamId}, ${t.userId}) = 1`),
    check("enrollment_access_mode_check", oneOf(t.accessMode, accessModes)),
  ],
);

/**
 * Per-enrollment lesson settings. Both fields are three-state: NULL means
 * "no opinion": `unlocked` falls back to the enrollment's access mode and
 * `video_url` to the lesson's own video.
 */
export const enrollmentLesson = pgTable(
  "enrollment_lesson",
  {
    id: id(),
    organizationId: tenant(),
    enrollmentId: uuid("enrollment_id").notNull(),
    lessonId: uuid("lesson_id").notNull(),
    unlocked: boolean("unlocked"),
    videoUrl: text("video_url"),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "enrollment_lesson_enrollment_fk",
      columns: [t.enrollmentId, t.organizationId],
      foreignColumns: [enrollment.id, enrollment.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "enrollment_lesson_lesson_fk",
      columns: [t.lessonId, t.organizationId],
      foreignColumns: [lesson.id, lesson.organizationId],
    }).onDelete("cascade"),
    uniqueIndex("enrollment_lesson_idx").on(t.enrollmentId, t.lessonId),
    index("enrollment_lesson_lesson_idx").on(t.lessonId),
  ],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: id(),
    organizationId: tenant(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id").notNull(),
    completedAt: timestamptz("completed_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "lesson_progress_lesson_fk",
      columns: [t.lessonId, t.organizationId],
      foreignColumns: [lesson.id, lesson.organizationId],
    }).onDelete("cascade"),
    uniqueIndex("lesson_progress_user_lesson_idx").on(t.userId, t.lessonId),
  ],
);
