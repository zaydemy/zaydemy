import { schema } from "@zaydemy/db";
import type { AccessMode } from "@zaydemy/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { reachesClass, reachesStudent } from "../organization/reach";
import { forbidden, notFound, ok, type Denied } from "../organization/results";
import { isStaff } from "../tenancy/permissions";
import { contextOf, type TenantTransaction } from "../tenancy/with-tenant";
import { cleanUrl } from "./authoring";
import { checkPrerequisite, type EnrollmentNode } from "./prerequisite";

const { enrollment, enrollmentLesson, lesson, section, program, member, team, user } = schema;

/*
 * Giving programs to classes and students, and tuning what each enrollment
 * opens. Owners and admins manage every enrollment; instructors manage the
 * ones of the classes they teach and of the students in those classes.
 */

type Target = { teamId: string; userId?: undefined } | { userId: string; teamId?: undefined };

async function reaches(
  tx: TenantTransaction,
  target: { teamId: string | null; userId: string | null },
): Promise<boolean> {
  if (target.teamId) return reachesClass(tx, target.teamId);
  if (target.userId) return reachesStudent(tx, target.userId);
  return false;
}

/** Loads an enrollment the actor may manage. */
async function manageable(tx: TenantTransaction, id: string) {
  if (!isStaff(contextOf(tx).role)) return forbidden;
  const [row] = await tx.select().from(enrollment).where(eq(enrollment.id, id));
  if (!row) return notFound;
  if (!(await reaches(tx, row))) return forbidden;
  return { status: "ok" as const, enrollment: row };
}

export async function assignProgram(
  tx: TenantTransaction,
  input: { programId: string } & Target,
): Promise<{ status: "created"; id: string } | { status: "already-assigned" } | Denied> {
  const context = contextOf(tx);
  if (!isStaff(context.role)) return forbidden;
  const target = { teamId: input.teamId ?? null, userId: input.userId ?? null };

  const [found] = await tx
    .select({ id: program.id })
    .from(program)
    .where(eq(program.id, input.programId));
  if (!found) return notFound;
  if (target.teamId) {
    const [cls] = await tx.select({ id: team.id }).from(team).where(eq(team.id, target.teamId));
    if (!cls) return notFound;
  } else {
    const [person] = await tx
      .select({ role: member.role })
      .from(member)
      .where(eq(member.userId, target.userId!));
    if (!person) return notFound;
  }
  if (!(await reaches(tx, target))) return forbidden;

  const [existing] = await tx
    .select({ id: enrollment.id })
    .from(enrollment)
    .where(
      and(
        eq(enrollment.programId, input.programId),
        target.teamId
          ? eq(enrollment.teamId, target.teamId)
          : eq(enrollment.userId, target.userId!),
      ),
    );
  if (existing) return { status: "already-assigned" };

  const [row] = await tx
    .insert(enrollment)
    .values({ organizationId: context.organizationId, programId: input.programId, ...target })
    .returning({ id: enrollment.id });
  return { status: "created", id: row!.id };
}

/** Takes the program back. Progress stays, and returns if the program is given again. */
export async function removeEnrollment(
  tx: TenantTransaction,
  id: string,
): Promise<typeof ok | Denied> {
  const found = await manageable(tx, id);
  if (found.status !== "ok") return found;
  await tx.delete(enrollment).where(eq(enrollment.id, id));
  return ok;
}

export async function setAccessMode(
  tx: TenantTransaction,
  id: string,
  mode: AccessMode,
): Promise<typeof ok | Denied> {
  const found = await manageable(tx, id);
  if (found.status !== "ok") return found;
  await tx.update(enrollment).set({ accessMode: mode }).where(eq(enrollment.id, id));
  return ok;
}

/** Lessons of the enrollment's program among `lessonIds` (all of them when omitted). */
async function programLessonIds(
  tx: TenantTransaction,
  programId: string,
  filter: { lessonIds?: string[]; sectionId?: string },
) {
  const rows = await tx
    .select({ id: lesson.id })
    .from(lesson)
    .innerJoin(section, eq(section.id, lesson.sectionId))
    .where(
      and(
        eq(section.programId, programId),
        filter.lessonIds ? inArray(lesson.id, filter.lessonIds) : undefined,
        filter.sectionId ? eq(lesson.sectionId, filter.sectionId) : undefined,
      ),
    );
  return rows.map((row) => row.id);
}

async function upsertSettings(
  tx: TenantTransaction,
  enrollmentId: string,
  lessonIds: string[],
  values: { unlocked?: boolean | null; videoUrl?: string | null },
) {
  const organizationId = contextOf(tx).organizationId;
  for (const lessonId of lessonIds) {
    await tx
      .insert(enrollmentLesson)
      .values({ organizationId, enrollmentId, lessonId, ...values })
      .onConflictDoUpdate({
        target: [enrollmentLesson.enrollmentId, enrollmentLesson.lessonId],
        set: values,
      });
  }
  // Rows that say nothing fall back to defaults anyway; do not keep them.
  await tx
    .delete(enrollmentLesson)
    .where(
      and(
        eq(enrollmentLesson.enrollmentId, enrollmentId),
        isNull(enrollmentLesson.unlocked),
        isNull(enrollmentLesson.videoUrl),
      ),
    );
}

/**
 * Opens (`true`) or locks (`false`) lessons for one enrollment, or returns
 * them to the access mode's default (`null`). `sectionId` targets a whole
 * section at once.
 */
export async function setLessonAccess(
  tx: TenantTransaction,
  enrollmentId: string,
  target: { lessonId: string } | { sectionId: string },
  unlocked: boolean | null,
): Promise<typeof ok | Denied> {
  const found = await manageable(tx, enrollmentId);
  if (found.status !== "ok") return found;
  const lessonIds = await programLessonIds(
    tx,
    found.enrollment.programId,
    "lessonId" in target ? { lessonIds: [target.lessonId] } : { sectionId: target.sectionId },
  );
  // A lesson or section of another program is not this enrollment's to set.
  if (lessonIds.length === 0) return notFound;
  await upsertSettings(tx, enrollmentId, lessonIds, { unlocked });
  return ok;
}

/** A video for this class only (e.g. the recording of their session); empty returns to the lesson's own. */
export async function setLessonVideo(
  tx: TenantTransaction,
  enrollmentId: string,
  lessonId: string,
  videoUrl: string,
): Promise<typeof ok | { status: "invalid-url" } | Denied> {
  const found = await manageable(tx, enrollmentId);
  if (found.status !== "ok") return found;
  const url = cleanUrl(videoUrl);
  if (url === undefined) return { status: "invalid-url" };
  const lessonIds = await programLessonIds(tx, found.enrollment.programId, {
    lessonIds: [lessonId],
  });
  if (lessonIds.length === 0) return notFound;
  await upsertSettings(tx, enrollmentId, lessonIds, { videoUrl: url });
  return ok;
}

/** Makes this enrollment wait for another one of the same target; `null` removes the rule. */
export async function setPrerequisite(
  tx: TenantTransaction,
  enrollmentId: string,
  requiresEnrollmentId: string | null,
): Promise<
  | typeof ok
  | { status: "invalid-prerequisite"; reason: "self" | "different-target" | "cycle" }
  | Denied
> {
  const found = await manageable(tx, enrollmentId);
  if (found.status !== "ok") return found;
  const current = found.enrollment;

  const siblings: EnrollmentNode[] = await tx
    .select({
      id: enrollment.id,
      teamId: enrollment.teamId,
      userId: enrollment.userId,
      requiresEnrollmentId: enrollment.requiresEnrollmentId,
    })
    .from(enrollment)
    .where(
      current.teamId
        ? eq(enrollment.teamId, current.teamId)
        : eq(enrollment.userId, current.userId!),
    );

  let prerequisite: EnrollmentNode | null = null;
  if (requiresEnrollmentId) {
    const [row] = await tx
      .select({
        id: enrollment.id,
        teamId: enrollment.teamId,
        userId: enrollment.userId,
        requiresEnrollmentId: enrollment.requiresEnrollmentId,
      })
      .from(enrollment)
      .where(eq(enrollment.id, requiresEnrollmentId));
    if (!row) return notFound;
    prerequisite = row;
  }

  const check = checkPrerequisite(current, prerequisite, siblings);
  if (!check.ok) return { status: "invalid-prerequisite", reason: check.reason };
  await tx.update(enrollment).set({ requiresEnrollmentId }).where(eq(enrollment.id, enrollmentId));
  return ok;
}

export interface EnrollmentRow {
  id: string;
  programId: string;
  programTitle: string;
  teamId: string | null;
  userId: string | null;
  /** Class name or student name. */
  targetName: string;
  accessMode: AccessMode;
  requiresEnrollmentId: string | null;
}

/** Enrollments of a program (or all) that the actor may manage. */
export async function listEnrollments(
  tx: TenantTransaction,
  filter: { programId?: string; teamId?: string } = {},
): Promise<{ status: "ok"; enrollments: EnrollmentRow[] } | Denied> {
  if (!isStaff(contextOf(tx).role)) return forbidden;
  const rows = await tx
    .select({
      id: enrollment.id,
      programId: enrollment.programId,
      programTitle: program.title,
      teamId: enrollment.teamId,
      userId: enrollment.userId,
      teamName: team.name,
      userName: user.name,
      accessMode: enrollment.accessMode,
      requiresEnrollmentId: enrollment.requiresEnrollmentId,
    })
    .from(enrollment)
    .innerJoin(program, eq(program.id, enrollment.programId))
    .leftJoin(team, eq(team.id, enrollment.teamId))
    .leftJoin(user, eq(user.id, enrollment.userId))
    .where(
      and(
        filter.programId ? eq(enrollment.programId, filter.programId) : undefined,
        filter.teamId ? eq(enrollment.teamId, filter.teamId) : undefined,
      ),
    )
    .orderBy(asc(enrollment.enrolledAt));

  const visible: EnrollmentRow[] = [];
  for (const { teamName, userName, ...row } of rows) {
    if (await reaches(tx, row)) visible.push({ ...row, targetName: teamName ?? userName ?? "" });
  }
  return { status: "ok", enrollments: visible };
}

export interface EnrollmentLessonState {
  lessonId: string;
  sectionId: string;
  /** The override; null follows the access mode. */
  override: boolean | null;
  /** What students get. */
  unlocked: boolean;
  videoUrl: string | null;
}

/** Per-lesson access of one enrollment, for the access editor. */
export async function getEnrollmentAccess(
  tx: TenantTransaction,
  enrollmentId: string,
): Promise<{ status: "ok"; accessMode: AccessMode; lessons: EnrollmentLessonState[] } | Denied> {
  const found = await manageable(tx, enrollmentId);
  if (found.status !== "ok") return found;
  const rows = await tx
    .select({
      lessonId: lesson.id,
      sectionId: lesson.sectionId,
      override: enrollmentLesson.unlocked,
      videoUrl: enrollmentLesson.videoUrl,
    })
    .from(lesson)
    .innerJoin(section, eq(section.id, lesson.sectionId))
    .leftJoin(
      enrollmentLesson,
      and(
        eq(enrollmentLesson.lessonId, lesson.id),
        eq(enrollmentLesson.enrollmentId, enrollmentId),
      ),
    )
    .where(eq(section.programId, found.enrollment.programId))
    .orderBy(asc(section.position), asc(lesson.position));
  const open = found.enrollment.accessMode === "open";
  return {
    status: "ok",
    accessMode: found.enrollment.accessMode,
    lessons: rows.map((row) => ({ ...row, unlocked: row.override ?? open })),
  };
}
