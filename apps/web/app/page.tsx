import { getTranslations } from "next-intl/server";

// Placeholder until the first module lands.
export default async function HomePage() {
  const t = await getTranslations("HomePage");

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-neutral-600">{t("description")}</p>
    </main>
  );
}
