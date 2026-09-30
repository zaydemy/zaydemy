import { signInCode } from "@zaydemy/auth";
import { isSetupRequired } from "@zaydemy/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth/auth-frame";
import { getDb } from "@/lib/server/db";
import { getBotProtection, getConfig } from "@/lib/server/services";
import { getSession } from "@/lib/server/session";
import { LoginFlow } from "./login-flow";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("signIn") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await isSetupRequired(getDb())) redirect("/setup");
  if (await getSession()) redirect("/");

  const { email, error } = await searchParams;
  const t = await getTranslations("SignIn.githubErrors");
  const githubErrors = {
    notLinked: t("notLinked"),
    denied: t("denied"),
    blocked: t("blocked"),
    failed: t("failed"),
  };
  return (
    <AuthFrame note="closedAccess">
      <LoginFlow
        bot={getBotProtection().client}
        initialEmail={typeof email === "string" ? email : ""}
        initialError={typeof error === "string" ? githubErrors[githubErrorKey(error)] : null}
        githubEnabled={getConfig().github !== null}
        codeMinutes={signInCode.expiresInSeconds / 60}
      />
    </AuthFrame>
  );
}

/** Better Auth's `?error=` code after a GitHub round trip → which message. */
function githubErrorKey(code: string) {
  const normalized = code.toLowerCase();
  if (normalized === "signup_disabled" || normalized === "account_not_linked") return "notLinked";
  if (normalized === "access_denied") return "denied";
  if (normalized.includes("banned")) return "blocked";
  return "failed";
}
