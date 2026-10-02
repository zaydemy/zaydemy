"use server";

import {
  addLesson,
  addSection,
  assignProgram,
  createProgram,
  deleteLesson,
  deleteProgram,
  deleteSection,
  moveLesson,
  moveSection,
  removeEnrollment,
  renameSection,
  restoreLessonNote,
  setAccessMode,
  setLessonAccess,
  setLessonVideo,
  setPrerequisite,
  setProgramStatus,
  updateLesson,
  updateProgram,
  type LessonPatch,
} from "@zaydemy/core";
import type { AccessMode, ProgramStatus } from "@zaydemy/db/schema";
import { revalidatePath } from "next/cache";
import { inTenant } from "@/lib/server/tenant";

/*
 * Curriculum management. The core functions check who may author (owners and
 * admins) and who may assign (also instructors, for their own classes); these
 * wrappers translate results for the UI and refresh the program pages.
 */

export type CurriculumError =
  | "forbidden"
  | "not-found"
  | "invalid-title"
  | "invalid-url"
  | "slug-taken"
  | "already-assigned"
  | "prerequisite-self"
  | "prerequisite-cycle"
  | "prerequisite-different-target";

export type CurriculumResult = { ok: true } | { ok: false; error: CurriculumError };
/** Deleting content that is in use asks for confirmation first. */
export type DeleteResult =
  CurriculumResult | { ok: false; error: "in-use"; enrollments: number; completions: number };

function refresh() {
  revalidatePath("/programs", "layout");
  revalidatePath("/");
}

function done(result: { status: string; reason?: string }): CurriculumResult {
  if (result.status === "ok" || result.status === "created") {
    refresh();
    return { ok: true };
  }
  if (result.status === "invalid-prerequisite") {
    return { ok: false, error: `prerequisite-${result.reason}` as CurriculumError };
  }
  return { ok: false, error: result.status as CurriculumError };
}

function deleted(
  result:
    | { status: "ok" }
    | { status: "in-use"; enrollments: number; completions: number }
    | { status: string },
): DeleteResult {
  if (result.status === "in-use" && "enrollments" in result) {
    return {
      ok: false,
      error: "in-use",
      enrollments: result.enrollments,
      completions: result.completions,
    };
  }
  return done(result);
}

export async function createProgramAction(input: {
  title: string;
  description: string;
}): Promise<{ ok: true; slug: string } | { ok: false; error: CurriculumError }> {
  const result = await inTenant((tx) => createProgram(tx, input));
  if (result.status !== "created") return done(result) as { ok: false; error: CurriculumError };
  refresh();
  return { ok: true, slug: result.slug };
}

export async function updateProgramAction(
  id: string,
  input: { title: string; description: string; slug: string },
): Promise<{ ok: true; slug: string } | { ok: false; error: CurriculumError }> {
  const result = await inTenant((tx) => updateProgram(tx, id, input));
  if (result.status !== "ok") return done(result) as { ok: false; error: CurriculumError };
  refresh();
  return { ok: true, slug: result.slug };
}

export async function setProgramStatusAction(id: string, status: ProgramStatus) {
  return done(await inTenant((tx) => setProgramStatus(tx, id, status)));
}

export async function deleteProgramAction(id: string, force: boolean) {
  return deleted(await inTenant((tx) => deleteProgram(tx, id, { force })));
}

export async function addSectionAction(programId: string, title: string) {
  return done(await inTenant((tx) => addSection(tx, programId, title)));
}

export async function renameSectionAction(id: string, title: string) {
  return done(await inTenant((tx) => renameSection(tx, id, title)));
}

export async function deleteSectionAction(id: string, force: boolean) {
  return deleted(await inTenant((tx) => deleteSection(tx, id, { force })));
}

export async function moveSectionAction(id: string, direction: -1 | 1) {
  return done(await inTenant((tx) => moveSection(tx, id, direction)));
}

export async function addLessonAction(sectionId: string, title: string) {
  return done(await inTenant((tx) => addLesson(tx, sectionId, title)));
}

export async function updateLessonAction(id: string, patch: LessonPatch) {
  return done(await inTenant((tx) => updateLesson(tx, id, patch)));
}

export async function restoreLessonNoteAction(lessonId: string, revisionId: string) {
  return done(await inTenant((tx) => restoreLessonNote(tx, lessonId, revisionId)));
}

export async function deleteLessonAction(id: string, force: boolean) {
  return deleted(await inTenant((tx) => deleteLesson(tx, id, { force })));
}

export async function moveLessonAction(id: string, direction: -1 | 1) {
  return done(await inTenant((tx) => moveLesson(tx, id, direction)));
}

export async function assignProgramAction(
  programId: string,
  target: { teamId: string } | { userId: string },
) {
  return done(await inTenant((tx) => assignProgram(tx, { programId, ...target })));
}

export async function removeEnrollmentAction(id: string) {
  return done(await inTenant((tx) => removeEnrollment(tx, id)));
}

export async function setAccessModeAction(id: string, mode: AccessMode) {
  return done(await inTenant((tx) => setAccessMode(tx, id, mode)));
}

export async function setLessonAccessAction(
  enrollmentId: string,
  target: { lessonId: string } | { sectionId: string },
  unlocked: boolean | null,
) {
  return done(await inTenant((tx) => setLessonAccess(tx, enrollmentId, target, unlocked)));
}

export async function setLessonVideoAction(
  enrollmentId: string,
  lessonId: string,
  videoUrl: string,
) {
  return done(await inTenant((tx) => setLessonVideo(tx, enrollmentId, lessonId, videoUrl)));
}

export async function setPrerequisiteAction(
  enrollmentId: string,
  requiresEnrollmentId: string | null,
) {
  return done(await inTenant((tx) => setPrerequisite(tx, enrollmentId, requiresEnrollmentId)));
}
