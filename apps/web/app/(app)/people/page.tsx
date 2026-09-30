import {
  assignableRoles,
  isStaff,
  listClassOverview,
  listPeople,
  managesOrganization,
} from "@zaydemy/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { inTenant } from "@/lib/server/tenant";
import { PeopleView } from "./people-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: t("people") };
}

export default async function PeoplePage() {
  const data = await inTenant(async (tx, tenant) => {
    if (!isStaff(tenant.context.role)) return null;
    const people = await listPeople(tx);
    return {
      people: people.status === "ok" ? people.people : [],
      classes: await listClassOverview(tx),
      me: tenant.context.userId,
      assignable: [...assignableRoles(tenant.context.role)],
      canManage: managesOrganization(tenant.context.role),
      showRoles: tenant.organization.preset !== "individual",
    };
  });
  if (!data) redirect("/");
  return <PeopleView {...data} />;
}
