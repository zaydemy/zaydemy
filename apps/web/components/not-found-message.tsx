import { getTranslations } from "next-intl/server";
import Link from "next/link";

/**
 * "Not found", in the viewer's language. Also what people see for things
 * they may not access: the app does not confirm that a locked or foreign
 * page exists.
 */
export async function NotFoundMessage() {
  const t = await getTranslations("NotFound");
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <p className="font-mono text-[12px] tracking-[0.16em] text-faint">404</p>
      <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">{t("title")}</h1>
      <p className="text-[14px] text-muted">{t("body")}</p>
      <Link
        href="/"
        className="mt-2 inline-flex h-10 items-center rounded-card bg-primary px-4 text-[14px] font-medium text-on-primary hover:bg-primary-hover"
      >
        {t("home")}
      </Link>
    </div>
  );
}
