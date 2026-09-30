import { getClassRoster, listPeople, managesOrganization } from "@zaydemy/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inTenant } from "@/lib/server/tenant";
import { ClassDetail } from "./class-detail";

export const metadata: Metadata = {};

export default async function ClassPage({ params }: PageProps<"/classes/[id]">) {
  const { id } = await params;
  // Not a uuid: not a class (and not worth a database round trip).
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const data = await inTenant(async (tx, tenant) => {
    const roster = await getClassRoster(tx, id);
    if (roster.status !== "ok") return null;
    const people = await listPeople(tx, { status: "active" });
    const inClass = new Set(roster.roster.members.map((m) => m.userId));
    return {
      roster: roster.roster,
      candidates: people.status === "ok" ? people.people.filter((p) => !inClass.has(p.userId)) : [],
      canManage: managesOrganization(tenant.context.role),
      showRoles: tenant.organization.preset !== "individual",
    };
  });
  if (!data) notFound();

  return <ClassDetail {...data} />;
}
