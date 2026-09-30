import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getConfig } from "@/lib/server/services";
import { requireSession } from "@/lib/server/session";
import { getGithubLink, listMyPasskeys, listMySessions } from "./actions";
import {
  AppearanceSection,
  GithubSection,
  PasskeysSection,
  ProfileSection,
  SessionsSection,
} from "./settings-sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("settings") };
}

export default async function SettingsPage() {
  const session = await requireSession();
  const t = await getTranslations("Settings");
  const [passkeys, github, sessions] = await Promise.all([
    listMyPasskeys(),
    getGithubLink(),
    listMySessions(),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">{t("title")}</h1>
      <ProfileSection
        name={session.user.name}
        email={session.user.email}
        locale={session.user.locale ?? null}
      />
      <AppearanceSection />
      <PasskeysSection passkeys={passkeys} />
      <GithubSection enabled={getConfig().github !== null} link={github} />
      <SessionsSection sessions={sessions} />
    </div>
  );
}
