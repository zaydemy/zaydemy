import { signInCode } from "@zaydemy/auth";
import { isSetupRequired } from "@zaydemy/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { getDb } from "@/lib/server/db";
import { getBotProtection } from "@/lib/server/services";
import { getSession } from "@/lib/server/session";
import { LoginFlow } from "./login-flow";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("signIn") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await isSetupRequired(getDb())) redirect("/setup");
  if (await getSession()) redirect("/");

  const { email } = await searchParams;
  return (
    <AuthFrame note="closedAccess">
      <LoginFlow
        bot={getBotProtection().client}
        initialEmail={typeof email === "string" ? email : ""}
        codeMinutes={signInCode.expiresInSeconds / 60}
      />
    </AuthFrame>
  );
}
