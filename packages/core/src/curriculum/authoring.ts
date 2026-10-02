import { schema } from "@zaydemy/db";
import type { ProgramStatus } from "@zaydemy/db/schema";
import { and, asc, count, desc, eq, gt, inArray, lt, max, ne, sql } from "drizzle-orm";
import { forbidden, notFound, ok, type Denied } from "../organization/results";
import { slugify } from "../platform/setup";
import { isStaff, managesOrganization } from "../tenancy/permissions";
import { contextOf, type TenantTransaction } from "../tenancy/with-tenant";

const { program, section, lesson, lessonNoteRevision, lessonProgress, enrollment } = schema;

/*
 * Writing the curriculum. Owners and admins author it; every staff member
 * can read it (instructors assign programs to their classes and preview
 * lessons, drafts included).
 */

type Invalid = { status: "invalid-title" } | { status: "invalid-url" } | { status: "slug-taken" };
type InUse = { status: "in-use"; enrollments: number; completions: number };

function canAuthor(tx: TenantTransaction): boolean {
  return managesOrganization(contextOf(tx).role);
}

function cleanTitle(value: string, maxLength = 160): string | null {
  const title = value.trim().replace(/\s+/g, " ");
  return title.length >= 1 && title.length <= maxLength ? title : null;
}

/** A free slug in this organization: `title`, `title-2`, `title-3`, … */
async function freeSlug(tx: TenantTransaction, base: string, exceptId?: string): Promise<string> {
  const root = slugify(base) === "organization" ? "program" : slugify(base);
  const taken = new Set(
    (
      await tx
        .select({ slug: program.slug })
        .from(program)
        .where(exceptId ? ne(program.id, exceptId) : undefined)
    ).map((row) => row.slug),
  );
  if (!taken.has(root)) return root;
  for (let n = 2; ; n += 1) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
}

export async function createProgram(
  tx: TenantTransaction,
  input: { title: string; description?: string },
): Promise<{ status: "created"; id: string; slug: string } | Invalid | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const title = cleanTitle(input.title);
  if (!title) return { status: "invalid-title" };
  const [row] = await tx
    .insert(program)
    .values({
      organizationId: contextOf(tx).organizationId,
      title,
      slug: await freeSlug(tx, title),
      description: input.description?.trim() ?? "",
    })
    .returning({ id: program.id, slug: program.slug });
  return { status: "created", id: row!.id, slug: row!.slug };
}

export async function updateProgram(
  tx: TenantTransaction,
  id: string,
  input: { title?: string; description?: string; slug?: string },
): Promise<{ status: "ok"; slug: string } | Invalid | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const values: Partial<typeof program.$inferInsert> = {};
  if (input.title !== undefined) {
    const title = cleanTitle(input.title);
    if (!title) return { status: "invalid-title" };
    values.title = title;
  }
  if (input.description !== undefined) values.description = input.description.trim();
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if ((await freeSlug(tx, slug, id)) !== slug) return { status: "slug-taken" };
    values.slug = slug;
  }
  const [row] = await tx
    .update(program)
    .set(values)
    .where(eq(program.id, id))
    .returning({ slug: program.slug });
  return row ? { status: "ok", slug: row.slug } : notFound;
}

/** Draft programs are invisible to students, even enrolled ones. */
export async function setProgramStatus(
  tx: TenantTransaction,
  id: string,
  status: ProgramStatus,
): Promise<typeof ok | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const rows = await tx
    .update(program)
    .set({ status })
    .where(eq(program.id, id))
    .returning({ id: program.id });
  return rows.length > 0 ? ok : notFound;
}

async function usage(
  tx: TenantTransaction,
  lessonIds: string[],
  programId?: string,
): Promise<{ enrollments: number; completions: number }> {
  const [done] =
    lessonIds.length > 0
      ? await tx
          .select({ n: count() })
          .from(lessonProgress)
          .where(inArray(lessonProgress.lessonId, lessonIds))
      : [{ n: 0 }];
  const [given] = programId
    ? await tx.select({ n: count() }).from(enrollment).where(eq(enrollment.programId, programId))
    : [{ n: 0 }];
  return { enrollments: given?.n ?? 0, completions: done?.n ?? 0 };
}

async function lessonIdsOf(
  tx: TenantTransaction,
  where: { programId?: string; sectionId?: string },
): Promise<string[]> {
  const rows = await tx
    .select({ id: lesson.id })
    .from(lesson)
    .innerJoin(section, eq(section.id, lesson.sectionId))
    .where(
      where.sectionId
        ? eq(lesson.sectionId, where.sectionId)
        : eq(section.programId, where.programId!),
    );
  return rows.map((row) => row.id);
}

/**
 * Deletes a program with its sections, lessons, enrollments and progress.
 * Refuses when it is given to anyone or has completions, unless forced.
 */
export async function deleteProgram(
  tx: TenantTransaction,
  id: string,
  options: { force?: boolean } = {},
): Promise<typeof ok | InUse | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const inUse = await usage(tx, await lessonIdsOf(tx, { programId: id }), id);
  if ((inUse.enrollments > 0 || inUse.completions > 0) && !options.force)
    return { status: "in-use", ...inUse };
  const rows = await tx.delete(program).where(eq(program.id, id)).returning({ id: program.id });
  return rows.length > 0 ? ok : notFound;
}

/* ----------------------------------------------------------------- sections */

export async function addSection(
  tx: TenantTransaction,
  programId: string,
  title: string,
): Promise<{ status: "created"; id: string } | Invalid | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const clean = cleanTitle(title);
  if (!clean) return { status: "invalid-title" };
  const [parent] = await tx
    .select({ id: program.id })
    .from(program)
    .where(eq(program.id, programId));
  if (!parent) return notFound;
  const [last] = await tx
    .select({ value: max(section.position) })
    .from(section)
    .where(eq(section.programId, programId));
  const [row] = await tx
    .insert(section)
    .values({
      organizationId: contextOf(tx).organizationId,
      programId,
      title: clean,
      position: (last?.value ?? 0) + 1,
    })
    .returning({ id: section.id });
  return { status: "created", id: row!.id };
}

export async function renameSection(
  tx: TenantTransaction,
  id: string,
  title: string,
): Promise<typeof ok | Invalid | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const clean = cleanTitle(title);
  if (!clean) return { status: "invalid-title" };
  const rows = await tx
    .update(section)
    .set({ title: clean })
    .where(eq(section.id, id))
    .returning({ id: section.id });
  return rows.length > 0 ? ok : notFound;
}

export async function deleteSection(
  tx: TenantTransaction,
  id: string,
  options: { force?: boolean } = {},
): Promise<typeof ok | InUse | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const inUse = await usage(tx, await lessonIdsOf(tx, { sectionId: id }));
  if (inUse.completions > 0 && !options.force) return { status: "in-use", ...inUse };
  const rows = await tx.delete(section).where(eq(section.id, id)).returning({ id: section.id });
  return rows.length > 0 ? ok : notFound;
}

/** Moves a section one step up (-1) or down (1) by swapping with its neighbour. */
export async function moveSection(
  tx: TenantTransaction,
  id: string,
  direction: -1 | 1,
): Promise<typeof ok | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const [current] = await tx
    .select({ id: section.id, position: section.position, programId: section.programId })
    .from(section)
    .where(eq(section.id, id));
  if (!current) return notFound;
  const [neighbour] = await tx
    .select({ id: section.id, position: section.position })
    .from(section)
    .where(
      and(
        eq(section.programId, current.programId),
        direction === -1
          ? lt(section.position, current.position)
          : gt(section.position, current.position),
      ),
    )
    .orderBy(direction === -1 ? desc(section.position) : asc(section.position))
    .limit(1);
  if (!neighbour) return ok;
  await tx.update(section).set({ position: neighbour.position }).where(eq(section.id, current.id));
  await tx.update(section).set({ position: current.position }).where(eq(section.id, neighbour.id));
  return ok;
}

/* ------------------------------------------------------------------ lessons */

export async function addLesson(
  tx: TenantTransaction,
  sectionId: string,
  title: string,
): Promise<{ status: "created"; id: string } | Invalid | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const clean = cleanTitle(title);
  if (!clean) return { status: "invalid-title" };
  const [parent] = await tx
    .select({ id: section.id })
    .from(section)
    .where(eq(section.id, sectionId));
  if (!parent) return notFound;
  const [last] = await tx
    .select({ value: max(lesson.position) })
    .from(lesson)
    .where(eq(lesson.sectionId, sectionId));
  const [row] = await tx
    .insert(lesson)
    .values({
      organizationId: contextOf(tx).organizationId,
      sectionId,
      title: clean,
      position: (last?.value ?? 0) + 1,
    })
    .returning({ id: lesson.id });
  return { status: "created", id: row!.id };
}

export interface LessonPatch {
  title?: string;
  durationMinutes?: number;
  published?: boolean;
  /** Markdown; empty clears the note. */
  note?: string;
  /** http(s) URL; empty clears it. */
  videoUrl?: string;
}

/** `http(s)://…` or null for empty; undefined when it is neither. */
export function cleanUrl(value: string): string | null | undefined {
  const url = value.trim();
  if (!url) return null;
  return /^https?:\/\/\S+$/i.test(url) ? url : undefined;
}

/** The text a save replaces becomes a revision, unless nothing changed or there was none. */
async function keepRevision(
  tx: TenantTransaction,
  lessonId: string,
  previous: string | null,
  next: string | null,
) {
  if (!previous || previous === next) return;
  const context = contextOf(tx);
  await tx.insert(lessonNoteRevision).values({
    organizationId: context.organizationId,
    lessonId,
    note: previous,
    authorId: context.userId,
  });
}

export async function updateLesson(
  tx: TenantTransaction,
  id: string,
  patch: LessonPatch,
): Promise<typeof ok | Invalid | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const values: Partial<typeof lesson.$inferInsert> = {};
  if (patch.title !== undefined) {
    const title = cleanTitle(patch.title);
    if (!title) return { status: "invalid-title" };
    values.title = title;
  }
  if (patch.durationMinutes !== undefined) {
    values.durationMinutes = Math.min(1440, Math.max(0, Math.round(patch.durationMinutes) || 0));
  }
  if (patch.published !== undefined) values.published = patch.published;
  if (patch.videoUrl !== undefined) {
    const url = cleanUrl(patch.videoUrl);
    if (url === undefined) return { status: "invalid-url" };
    values.videoUrl = url;
  }

  const [current] = await tx.select({ note: lesson.note }).from(lesson).where(eq(lesson.id, id));
  if (!current) return notFound;
  if (patch.note !== undefined) {
    values.note = patch.note.trim() || null;
    await keepRevision(tx, id, current.note, values.note);
  }
  await tx.update(lesson).set(values).where(eq(lesson.id, id));
  return ok;
}

/**
 * Goes back to a revision. Restoring is itself an edit: the current text
 * becomes a revision too, so restoring the wrong one is recoverable, and
 * revisions are never deleted.
 */
export async function restoreLessonNote(
  tx: TenantTransaction,
  lessonId: string,
  revisionId: string,
): Promise<typeof ok | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const [revision] = await tx
    .select({ note: lessonNoteRevision.note })
    .from(lessonNoteRevision)
    // The lesson id too: a revision id from another lesson must not be applied here.
    .where(and(eq(lessonNoteRevision.id, revisionId), eq(lessonNoteRevision.lessonId, lessonId)));
  const [current] = await tx
    .select({ note: lesson.note })
    .from(lesson)
    .where(eq(lesson.id, lessonId));
  if (!revision || !current) return notFound;
  await keepRevision(tx, lessonId, current.note, revision.note);
  await tx.update(lesson).set({ note: revision.note }).where(eq(lesson.id, lessonId));
  return ok;
}

export async function deleteLesson(
  tx: TenantTransaction,
  id: string,
  options: { force?: boolean } = {},
): Promise<typeof ok | InUse | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const inUse = await usage(tx, [id]);
  if (inUse.completions > 0 && !options.force) return { status: "in-use", ...inUse };
  const rows = await tx.delete(lesson).where(eq(lesson.id, id)).returning({ id: lesson.id });
  return rows.length > 0 ? ok : notFound;
}

/** Moves a lesson one step up (-1) or down (1) within its section. */
export async function moveLesson(
  tx: TenantTransaction,
  id: string,
  direction: -1 | 1,
): Promise<typeof ok | Denied> {
  if (!canAuthor(tx)) return forbidden;
  const [current] = await tx
    .select({ id: lesson.id, position: lesson.position, sectionId: lesson.sectionId })
    .from(lesson)
    .where(eq(lesson.id, id));
  if (!current) return notFound;
  const [neighbour] = await tx
    .select({ id: lesson.id, position: lesson.position })
    .from(lesson)
    .where(
      and(
        eq(lesson.sectionId, current.sectionId),
        direction === -1
          ? lt(lesson.position, current.position)
          : gt(lesson.position, current.position),
      ),
    )
    .orderBy(direction === -1 ? desc(lesson.position) : asc(lesson.position))
    .limit(1);
  if (!neighbour) return ok;
  await tx.update(lesson).set({ position: neighbour.position }).where(eq(lesson.id, current.id));
  await tx.update(lesson).set({ position: current.position }).where(eq(lesson.id, neighbour.id));
  return ok;
}

/* ------------------------------------------------------------ staff reading */

export interface ProgramSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: ProgramStatus;
  lessons: number;
  enrollments: number;
}

/** Every program of the organization, drafts included. Staff only. */
export async function listPrograms(
  tx: TenantTransaction,
): Promise<{ status: "ok"; programs: ProgramSummary[] } | Denied> {
  if (!isStaff(contextOf(tx).role)) return forbidden;
  const rows = await tx
    .select({
      id: program.id,
      slug: program.slug,
      title: program.title,
      description: program.description,
      status: program.status,
      lessons: sql<number>`(select count(*)::int from ${lesson} l join ${section} s on s.id = l.section_id where s.program_id = ${program}.id)`,
      enrollments: sql<number>`(select count(*)::int from ${enrollment} e where e.program_id = ${program}.id)`,
    })
    .from(program)
    .orderBy(asc(program.title));
  return { status: "ok", programs: rows };
}

export interface ProgramOutline {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: ProgramStatus;
  sections: {
    id: string;
    title: string;
    lessons: {
      id: string;
      title: string;
      durationMinutes: number;
      published: boolean;
      hasNote: boolean;
      hasVideo: boolean;
    }[];
  }[];
}

/** A program with its sections and lessons in order, drafts included. Staff only. */
export async function getProgramOutline(
  tx: TenantTransaction,
  slug: string,
): Promise<{ status: "ok"; program: ProgramOutline } | Denied> {
  if (!isStaff(contextOf(tx).role)) return forbidden;
  const [found] = await tx.select().from(program).where(eq(program.slug, slug));
  if (!found) return notFound;
  const sections = await tx
    .select({ id: section.id, title: section.title })
    .from(section)
    .where(eq(section.programId, found.id))
    .orderBy(asc(section.position));
  const lessons =
    sections.length === 0
      ? []
      : await tx
          .select({
            id: lesson.id,
            sectionId: lesson.sectionId,
            title: lesson.title,
            durationMinutes: lesson.durationMinutes,
            published: lesson.published,
            hasNote: sql<boolean>`${lesson.note} is not null`,
            hasVideo: sql<boolean>`${lesson.videoUrl} is not null`,
          })
          .from(lesson)
          .where(
            inArray(
              lesson.sectionId,
              sections.map((s) => s.id),
            ),
          )
          .orderBy(asc(lesson.position));
  return {
    status: "ok",
    program: {
      id: found.id,
      slug: found.slug,
      title: found.title,
      description: found.description,
      status: found.status,
      sections: sections.map((s) => ({
        ...s,
        lessons: lessons
          .filter((l) => l.sectionId === s.id)
          .map(({ sectionId: _sectionId, ...l }) => l),
      })),
    },
  };
}

/** A lesson for editing, with its note revisions (newest first). Staff only. */
export async function getLessonForEditing(tx: TenantTransaction, id: string) {
  if (!isStaff(contextOf(tx).role)) return forbidden;
  const [found] = await tx.select().from(lesson).where(eq(lesson.id, id));
  if (!found) return notFound;
  const revisions = await tx
    .select({
      id: lessonNoteRevision.id,
      note: lessonNoteRevision.note,
      createdAt: lessonNoteRevision.createdAt,
      author: schema.user.name,
    })
    .from(lessonNoteRevision)
    .leftJoin(schema.user, eq(schema.user.id, lessonNoteRevision.authorId))
    .where(eq(lessonNoteRevision.lessonId, id))
    .orderBy(desc(lessonNoteRevision.createdAt));
  return { status: "ok" as const, lesson: found, revisions };
}
