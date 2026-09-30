import { isStaff, listClassOverview, managesOrganization } from "@zaydemy/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { inTenant } from "@/lib/server/tenant";
import { ClassesView } from "./classes-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: t("classes") };
}

export default async function ClassesPage() {
  const data = await inTenant(async (tx, tenant) =>
    // Students see their classes on the home page.
    isStaff(tenant.context.role)
      ? {
          classes: await listClassOverview(tx),
          canManage: managesOrganization(tenant.context.role),
        }
      : null,
  );
  if (!data) redirect("/");
  return <ClassesView {...data} />;
}
