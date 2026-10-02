"use server";

import { setLessonDone } from "@zaydemy/core";
import { revalidatePath } from "next/cache";
import { inTenant } from "@/lib/server/tenant";

/** Marks a lesson done or not done for the signed-in learner. */
export async function setLessonDoneAction(
  lessonId: string,
  done: boolean,
): Promise<{ ok: boolean }> {
  const result = await inTenant((tx) => setLessonDone(tx, lessonId, done));
  if (result.status !== "ok") return { ok: false };
  revalidatePath("/learn", "layout");
  revalidatePath("/");
  return { ok: true };
}
