import { isSetupRequired } from "@zaydemy/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { getDb } from "@/lib/server/db";
import { getConfig } from "@/lib/server/services";
import { SetupForm } from "./setup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("setup") };
}

/** First run only: once an account exists this page is gone for good. */
export default async function SetupPage() {
  if (!(await isSetupRequired(getDb()))) redirect("/login");
  return (
    <AuthFrame note="setupNote">
      <SetupForm appName={getConfig().appName} />
    </AuthFrame>
  );
}
