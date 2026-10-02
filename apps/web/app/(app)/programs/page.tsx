import { listPrograms, managesOrganization } from "@zaydemy/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { inTenant } from "@/lib/server/tenant";
import { ProgramsView } from "./programs-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: t("programs") };
}

/** Program management, for staff. Students reach their programs from home. */
export default async function ProgramsPage() {
  const data = await inTenant(async (tx, tenant) => {
    const result = await listPrograms(tx);
    return result.status === "ok"
      ? { programs: result.programs, canAuthor: managesOrganization(tenant.context.role) }
      : null;
  });
  if (!data) redirect("/");
  return <ProgramsView {...data} />;
}
