import { getLessonForEditing, managesOrganization } from "@zaydemy/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inTenant } from "@/lib/server/tenant";
import { LessonEditor } from "./lesson-editor";

const uuid = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({
  params,
}: PageProps<"/programs/[slug]/lessons/[lessonId]">): Promise<Metadata> {
  const { lessonId } = await params;
  if (!uuid.test(lessonId)) return {};
  const result = await inTenant((tx) => getLessonForEditing(tx, lessonId));
  return { title: result.status === "ok" ? result.lesson.title : undefined };
}

export default async function LessonPage({
  params,
}: PageProps<"/programs/[slug]/lessons/[lessonId]">) {
  const { slug, lessonId } = await params;
  if (!uuid.test(lessonId)) notFound();
  const data = await inTenant(async (tx, tenant) => {
    const result = await getLessonForEditing(tx, lessonId);
    return result.status === "ok"
      ? {
          lesson: result.lesson,
          revisions: result.revisions,
          canAuthor: managesOrganization(tenant.context.role),
        }
      : null;
  });
  if (!data) notFound();
  // No remount after a save: that would throw away what the author typed
  // while the page refreshed. A restore updates the editor's text itself.
  return <LessonEditor slug={slug} {...data} />;
}
