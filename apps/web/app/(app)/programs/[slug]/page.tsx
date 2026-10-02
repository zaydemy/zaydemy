import {
  getProgramOutline,
  listClassOverview,
  listEnrollments,
  listPeople,
  managesOrganization,
} from "@zaydemy/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inTenant } from "@/lib/server/tenant";
import { ProgramEditor } from "./program-editor";

export async function generateMetadata({
  params,
}: PageProps<"/programs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await inTenant((tx) => getProgramOutline(tx, slug));
  return { title: result.status === "ok" ? result.program.title : undefined };
}

export default async function ProgramPage({ params }: PageProps<"/programs/[slug]">) {
  const { slug } = await params;
  const data = await inTenant(async (tx, tenant) => {
    const outline = await getProgramOutline(tx, slug);
    if (outline.status !== "ok") return null;
    const [enrollments, classes, people] = await Promise.all([
      listEnrollments(tx, { programId: outline.program.id }),
      listClassOverview(tx),
      listPeople(tx, { role: "student", status: "active" }),
    ]);
    // Prerequisites pick among everything given to the same target, so load
    // the other programs' enrollments of those targets too.
    const all = await listEnrollments(tx);
    const targets = new Set(
      (enrollments.status === "ok" ? enrollments.enrollments : []).map((e) => e.teamId ?? e.userId),
    );
    return {
      program: outline.program,
      enrollments: enrollments.status === "ok" ? enrollments.enrollments : [],
      related:
        all.status === "ok" ? all.enrollments.filter((e) => targets.has(e.teamId ?? e.userId)) : [],
      classes: classes.filter((c) => !c.archivedAt).map((c) => ({ id: c.id, name: c.name })),
      students:
        people.status === "ok" ? people.people.map((p) => ({ id: p.userId, name: p.name })) : [],
      canAuthor: managesOrganization(tenant.context.role),
    };
  });
  if (!data) notFound();
  return <ProgramEditor {...data} />;
}
