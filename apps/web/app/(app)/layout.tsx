import { LogOut } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/auth/brand-mark";
import { getConfig } from "@/lib/server/services";
import { listMemberships, requireSession } from "@/lib/server/session";
import { signOut, switchOrganization } from "./actions";

/** Signed-in shell. A placeholder until the full navigation arrives with the class module. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const t = await getTranslations("Shell");
  const { appName } = getConfig();
  const memberships = await listMemberships(session.user.id);
  const activeId =
    memberships.find((m) => m.organizationId === session.session.activeOrganizationId)
      ?.organizationId ?? memberships[0]?.organizationId;

  return (
    <div className="min-h-svh">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5 rounded-[10px]">
            <BrandMark name={appName} />
            <span className="text-[15px] font-semibold tracking-[-0.015em]">{appName}</span>
          </Link>

          {memberships.length > 1 ? (
            <nav aria-label={t("organization")} className="flex gap-1 overflow-x-auto">
              {memberships.map((m) => (
                <form
                  key={m.organizationId}
                  action={switchOrganization.bind(null, m.organizationId)}
                >
                  <button
                    type="submit"
                    aria-current={m.organizationId === activeId ? "true" : undefined}
                    title={t("switchTo", { name: m.name })}
                    className="h-8 rounded-[10px] px-3 text-[13px] whitespace-nowrap text-muted transition-colors hover:bg-subtle-2 hover:text-body aria-[current]:bg-subtle-2 aria-[current]:font-medium aria-[current]:text-body"
                  >
                    {m.name}
                  </button>
                </form>
              ))}
            </nav>
          ) : null}

          <div className="ms-auto flex items-center gap-1">
            <Link
              href="/settings"
              className="flex h-8 items-center rounded-[10px] px-2.5 text-[13px] text-muted transition-colors hover:bg-subtle-2 hover:text-body"
            >
              <span className="hidden sm:inline">{session.user.name}</span>
              <span className="sm:hidden">{t("settings")}</span>
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] text-muted transition-colors hover:bg-subtle-2 hover:text-body"
              >
                <LogOut size={15} strokeWidth={1.75} className="rtl:rotate-180" />
                {t("signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
