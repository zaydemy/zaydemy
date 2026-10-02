import { schema } from "@zaydemy/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { forbidden, notFound, ok, type Denied } from "../organization/results";
import { isStaff } from "../tenancy/permissions";
import { contextOf, type TenantTransaction } from "../tenancy/with-tenant";

const { enrollment, enrollmentLesson, lesson, lessonProgress, program, section, teamMember } =
  schema;

/*
 * The learner's side of the curriculum: which programs they have, which
 * lessons are open, what they finished.
 *
 * A program reaches a learner directly or through any of their classes.
 * Students only ever see published programs and published lessons. Staff
 * read everything as a preview: every lesson open, drafts included.
 */

/** Enrollments that apply to the user: their own, or their classes'. */
function appliesTo(userId: string) {
  return sql`(${enrollment.userId} = ${userId} or ${enrollment.teamId} in (
    select tm.team_id from ${teamMember} tm where tm.user_id = ${userId}
  ))`;
}

interface AccessRow extends Record<string, unknown> {
  program_id: string;
  lesson_id: string;
  unlocked: boolean;
  video_url: string | null;
}

/**
 * Each published lesson's state for the user, per program.
 *
 * The same program can reach someone twice (their class and themselves);
 * rows merge with `bool_or`, so **open wins**: nobody is locked out by two
 * enrollments disagreeing. Video: a set one beats an empty one, and on a tie
 * the personal enrollment beats the class's.
 */
async function lessonAccess(
  tx: TenantTransaction,
  userId: string,
  filter: { programIds?: string[]; lessonId?: string },
): Promise<AccessRow[]> {
  if (filter.programIds && filter.programIds.length === 0) return [];
  const scope = filter.lessonId
    ? sql`l.id = ${filter.lessonId}`
    : sql`s.program_id in (${sql.join(
        filter.programIds!.map((id) => sql`${id}`),
        sql`, `,
      )})`;
  const rows = await tx.execute<AccessRow>(sql`
    select s.program_id,
           l.id as lesson_id,
           bool_or(coalesce(el.unlocked, ${enrollment}.access_mode = 'open')) as unlocked,
           (array_agg(el.video_url order by (el.video_url is null), (${enrollment}.user_id is null)))[1] as video_url
      from ${lesson} l
      join ${section} s on s.id = l.section_id
      join ${enrollment} on ${enrollment}.program_id = s.program_id
      left join ${enrollmentLesson} el on el.enrollment_id = ${enrollment}.id and el.lesson_id = l.id
     where ${scope}
       and l.published = true
       and ${appliesTo(userId)}
     group by s.program_id, l.id
  `);
  return [...rows];
}

export interface ProgramProgress {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** Open lessons only: locked lessons do not count against the learner. */
  totalLessons: number;
  doneLessons: number;
  /** Waiting for a prerequisite program to be finished. */
  locked: boolean;
  /** Title of the program that unlocks this one. */
  lockedBy: string | null;
}

/** The learner's programs, in the order they were given, with progress and prerequisite locks. */
export async function listMyPrograms(tx: TenantTransaction): Promise<ProgramProgress[]> {
  const { userId } = contextOf(tx);
  const rows = await tx
    .select({
      id: program.id,
      slug: program.slug,
      title: program.title,
      description: program.description,
      enrollmentId: enrollment.id,
      requiresEnrollmentId: enrollment.requiresEnrollmentId,
    })
    .from(enrollment)
    .innerJoin(program, eq(program.id, enrollment.programId))
    .where(and(appliesTo(userId), eq(program.status, "published")))
    .orderBy(asc(enrollment.enrolledAt));
  if (rows.length === 0) return [];

  const programIds = [...new Set(rows.map((row) => row.id))];
  const access = await lessonAccess(tx, userId, { programIds });
  const openIds = access.filter((row) => row.unlocked).map((row) => row.lesson_id);
  const totalBy = new Map<string, number>();
  for (const row of access)
    if (row.unlocked) totalBy.set(row.program_id, (totalBy.get(row.program_id) ?? 0) + 1);

  // Completed lessons count only while they are open: a lesson locked later
  // must not inflate the numerator.
  const done =
    openIds.length === 0
      ? []
      : await tx
          .select({ programId: section.programId, lessonId: lessonProgress.lessonId })
          .from(lessonProgress)
          .innerJoin(lesson, eq(lesson.id, lessonProgress.lessonId))
          .innerJoin(section, eq(section.id, lesson.sectionId))
          .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, openIds)));
  const doneBy = new Map<string, number>();
  for (const row of done) doneBy.set(row.programId, (doneBy.get(row.programId) ?? 0) + 1);

  /*
   * Finished = every OPEN lesson of that enrollment's program is done. An
   * enrollment with no open lesson is not finished: zero of zero is not
   * "complete". A prerequisite the learner cannot see (another class's, or
   * deleted) does not lock: nobody waits on something they cannot finish.
   */
  const finished = new Map<string, boolean>();
  const titleOf = new Map<string, string>();
  for (const row of rows) {
    const total = totalBy.get(row.id) ?? 0;
    finished.set(row.enrollmentId, total > 0 && (doneBy.get(row.id) ?? 0) >= total);
    titleOf.set(row.enrollmentId, row.title);
  }

  // A program that reaches the learner twice appears once; it is locked only
  // if every one of its enrollments is.
  const merged = new Map<string, ProgramProgress>();
  for (const row of rows) {
    const requires = row.requiresEnrollmentId;
    const locked = Boolean(requires && finished.get(requires) === false);
    const existing = merged.get(row.id);
    if (existing) {
      if (!locked) Object.assign(existing, { locked: false, lockedBy: null });
      continue;
    }
    merged.set(row.id, {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      totalLessons: totalBy.get(row.id) ?? 0,
      doneLessons: doneBy.get(row.id) ?? 0,
      locked,
      lockedBy: locked ? (titleOf.get(requires!) ?? null) : null,
    });
  }
  return [...merged.values()];
}

export interface LearnerLesson {
  id: string;
  title: string;
  durationMinutes: number;
  unlocked: boolean;
  done: boolean;
  /** Staff preview: a lesson students cannot see yet. */
  published: boolean;
}

export interface LearnerProgram {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** Staff reading the program as a preview, not as an enrolled learner. */
  preview: boolean;
  locked: boolean;
  lockedBy: string | null;
  sections: { id: string; title: string; lessons: LearnerLesson[] }[];
}

/** A program as its learner sees it: sections and lessons with their state. */
export async function getProgramForLearner(
  tx: TenantTransaction,
  slug: string,
): Promise<{ status: "ok"; program: LearnerProgram } | Denied> {
  const context = contextOf(tx);
  const staff = isStaff(context.role);
  const [found] = await tx.select().from(program).where(eq(program.slug, slug));
  if (!found) return notFound;

  const mine = staff ? undefined : (await listMyPrograms(tx)).find((p) => p.id === found.id);
  // Not enrolled, or a draft: to a student the program does not exist.
  if (!staff && !mine) return notFound;

  const sections = await tx
    .select({ id: section.id, title: section.title })
    .from(section)
    .where(eq(section.programId, found.id))
    .orderBy(asc(section.position));
  const lessons = await tx
    .select({
      id: lesson.id,
      sectionId: lesson.sectionId,
      title: lesson.title,
      durationMinutes: lesson.durationMinutes,
      published: lesson.published,
    })
    .from(lesson)
    .innerJoin(section, eq(section.id, lesson.sectionId))
    .where(and(eq(section.programId, found.id), staff ? undefined : eq(lesson.published, true)))
    .orderBy(asc(lesson.position));

  const access = staff ? [] : await lessonAccess(tx, context.userId, { programIds: [found.id] });
  const unlocked = new Set(access.filter((row) => row.unlocked).map((row) => row.lesson_id));
  const doneRows =
    lessons.length === 0
      ? []
      : await tx
          .select({ lessonId: lessonProgress.lessonId })
          .from(lessonProgress)
          .where(
            and(
              eq(lessonProgress.userId, context.userId),
              inArray(
                lessonProgress.lessonId,
                lessons.map((l) => l.id),
              ),
            ),
          );
  const done = new Set(doneRows.map((row) => row.lessonId));
  const locked = mine?.locked ?? false;

  return {
    status: "ok",
    program: {
      id: found.id,
      slug: found.slug,
      title: found.title,
      description: found.description,
      preview: staff,
      locked,
      lockedBy: mine?.lockedBy ?? null,
      sections: sections.map((s) => ({
        ...s,
        lessons: lessons
          .filter((l) => l.sectionId === s.id)
          .map(({ sectionId: _sectionId, ...l }) => ({
            ...l,
            // A program waiting for its prerequisite opens nothing.
            unlocked: staff || (!locked && unlocked.has(l.id)),
            done: done.has(l.id),
          })),
      })),
    },
  };
}

export interface LearnerLessonContent {
  id: string;
  title: string;
  durationMinutes: number;
  note: string | null;
  videoUrl: string | null;
  done: boolean;
  preview: boolean;
  program: { id: string; slug: string; title: string };
}

/**
 * A lesson's content, if the learner may open it: the program is published
 * and theirs, not waiting for a prerequisite, and the lesson is published and
 * unlocked for them. Anything else is "not found": a locked lesson's
 * existence is not confirmed by its URL.
 */
export async function getLessonForLearner(
  tx: TenantTransaction,
  lessonId: string,
): Promise<{ status: "ok"; lesson: LearnerLessonContent } | Denied> {
  const context = contextOf(tx);
  const staff = isStaff(context.role);
  const [row] = await tx
    .select({
      id: lesson.id,
      title: lesson.title,
      durationMinutes: lesson.durationMinutes,
      note: lesson.note,
      videoUrl: lesson.videoUrl,
      published: lesson.published,
      programId: program.id,
      programSlug: program.slug,
      programTitle: program.title,
    })
    .from(lesson)
    .innerJoin(section, eq(section.id, lesson.sectionId))
    .innerJoin(program, eq(program.id, section.programId))
    .where(eq(lesson.id, lessonId));
  if (!row) return notFound;

  let videoUrl = row.videoUrl;
  if (!staff) {
    if (!row.published) return notFound;
    const mine = (await listMyPrograms(tx)).find((p) => p.id === row.programId);
    if (!mine || mine.locked) return notFound;
    const [access] = await lessonAccess(tx, context.userId, { lessonId });
    if (!access?.unlocked) return notFound;
    videoUrl = access.video_url ?? row.videoUrl;
  }

  const [progress] = await tx
    .select({ id: lessonProgress.id })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, context.userId), eq(lessonProgress.lessonId, lessonId)));

  return {
    status: "ok",
    lesson: {
      id: row.id,
      title: row.title,
      durationMinutes: row.durationMinutes,
      note: row.note,
      videoUrl,
      done: Boolean(progress),
      preview: staff,
      program: { id: row.programId, slug: row.programSlug, title: row.programTitle },
    },
  };
}

/** Marks a lesson done (or not). Only lessons the learner can open; staff previews do not track progress. */
export async function setLessonDone(
  tx: TenantTransaction,
  lessonId: string,
  done: boolean,
): Promise<typeof ok | Denied> {
  const context = contextOf(tx);
  if (isStaff(context.role)) return forbidden;
  const found = await getLessonForLearner(tx, lessonId);
  if (found.status !== "ok") return found;

  if (done) {
    await tx
      .insert(lessonProgress)
      .values({ organizationId: context.organizationId, userId: context.userId, lessonId })
      .onConflictDoNothing({ target: [lessonProgress.userId, lessonProgress.lessonId] });
  } else {
    await tx
      .delete(lessonProgress)
      .where(and(eq(lessonProgress.userId, context.userId), eq(lessonProgress.lessonId, lessonId)));
  }
  return ok;
}
