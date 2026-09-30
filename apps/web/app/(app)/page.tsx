import {
  listAccessibleClasses,
  resolveTenantContext,
  seesAllClasses,
  withTenant,
} from "@zaydemy/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/server/db";
import { listMemberships, requireSession } from "@/lib/server/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("home") };
}

/**
 * Home, for now: who you are in the current organization and the classes you
 * may access. Class data goes through a tenant transaction, so row level
 * security applies.
 */
export default async function HomePage() {
  const session = await requireSession();
  const t = await getTranslations("Home");
  const memberships = await listMemberships(session.user.id);
  const active =
    memberships.find((m) => m.organizationId === session.session.activeOrganizationId) ??
    memberships[0];

  if (!active) {
    return (
      <section className="rounded-card border border-line bg-card p-6 shadow-card">
        <h1 className="text-[18px] font-medium">{t("noOrganizationTitle")}</h1>
        <p className="mt-2 text-[14px] text-muted">{t("noOrganizationBody")}</p>
      </section>
    );
  }

  const db = getDb();
  const context = await resolveTenantContext(db, {
    userId: session.user.id,
    organizationId: active.organizationId,
  });
  const classes = await withTenant(db, context, (tx) => listAccessibleClasses(tx));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
          {t("greeting", { name: session.user.name })}
        </h1>
        <p className="text-[14px] text-muted">
          {t("roleIn", { role: context.role, organization: active.name })}
        </p>
      </div>

      <section className="rounded-card border border-line bg-card shadow-card">
        <h2 className="border-b border-line px-4 py-3 text-[15px] font-medium">
          {seesAllClasses(context.role) ? t("allClassesTitle") : t("classesTitle")}
          <span className="ms-2 font-mono text-[11px] text-faint tabular-nums">
            {classes.length}
          </span>
        </h2>
        {classes.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-muted">{t("noClasses")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {classes.map((cls) => (
              <li key={cls.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className={cls.archivedAt ? "text-[14px] text-muted" : "text-[14px]"}>
                  {cls.name}
                </span>
                <span className="flex items-center gap-2">
                  {cls.archivedAt ? (
                    <span className="rounded-[6px] border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
                      {t("archived")}
                    </span>
                  ) : null}
                  <span className="text-[12px] text-muted">{t("kind", { kind: cls.kind })}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
