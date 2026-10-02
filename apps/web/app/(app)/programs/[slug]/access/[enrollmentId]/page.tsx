import { getEnrollmentAccess, getProgramOutline, listEnrollments } from "@zaydemy/core";
import { notFound } from "next/navigation";
import { inTenant } from "@/lib/server/tenant";
import { AccessEditor } from "./access-editor";

const uuid = /^[0-9a-f-]{36}$/i;

export default async function AccessPage({
  params,
}: PageProps<"/programs/[slug]/access/[enrollmentId]">) {
  const { slug, enrollmentId } = await params;
  if (!uuid.test(enrollmentId)) notFound();
  const data = await inTenant(async (tx) => {
    const outline = await getProgramOutline(tx, slug);
    const access = await getEnrollmentAccess(tx, enrollmentId);
    if (outline.status !== "ok" || access.status !== "ok") return null;
    const enrollments = await listEnrollments(tx, { programId: outline.program.id });
    const enrollment =
      enrollments.status === "ok"
        ? enrollments.enrollments.find((e) => e.id === enrollmentId)
        : null;
    // The enrollment must belong to this program's URL.
    if (!enrollment) return null;
    return {
      program: outline.program,
      enrollmentId,
      targetName: enrollment.targetName,
      accessMode: access.accessMode,
      lessons: access.lessons,
    };
  });
  if (!data) notFound();
  return <AccessEditor {...data} />;
}
