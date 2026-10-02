import { getProgramForLearner } from "@zaydemy/core";
import { ArrowLeft, Check, EyeOff, Lock } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressBar } from "@/components/progress-bar";
import { cn } from "@/lib/cn";
import { inTenant } from "@/lib/server/tenant";

export async function generateMetadata({ params }: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await inTenant((tx) => getProgramForLearner(tx, slug));
  return { title: result.status === "ok" ? result.program.title : undefined };
}

/** A program as its learner sees it. Staff get the same page as a preview. */
export default async function LearnProgramPage({ params }: PageProps<"/learn/[slug]">) {
  const { slug } = await params;
  const result = await inTenant((tx) => getProgramForLearner(tx, slug));
  if (result.status !== "ok") notFound();
  const { program } = result;
  const t = await getTranslations("Learn");

  const lessons = program.sections.flatMap((s) => s.lessons);
  const open = lessons.filter((l) => l.unlocked && l.published);
  const done = open.filter((l) => l.done).length;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link
        href={program.preview ? `/programs/${program.slug}` : "/"}
        className="flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-body"
      >
        <ArrowLeft size={15} strokeWidth={1.75} className="rtl:rotate-180" />
        {program.preview ? t("backToProgram", { program: program.title }) : t("back")}
      </Link>

      {program.preview ? (
        <p className="rounded-card border border-line bg-subtle px-4 py-2.5 text-[13px] text-muted">
          {t("preview")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
          {program.title}
        </h1>
        {program.description ? (
          <p className="text-[14px] leading-relaxed text-muted">{program.description}</p>
        ) : null}
      </div>

      {program.locked ? (
        <p className="flex items-center gap-2 rounded-card border border-warning-line bg-warning-soft px-4 py-2.5 text-[13px] text-warning">
          <Lock size={15} strokeWidth={1.75} className="flex-none" />
          {program.lockedBy ? t("lockedBy", { program: program.lockedBy }) : t("locked")}
        </p>
      ) : program.preview ? null : (
        <div className="flex flex-col gap-1.5">
          <ProgressBar
            done={done}
            total={open.length}
            label={t("progress", { done, total: open.length })}
          />
          <p className="text-[12.5px] text-muted tabular-nums">
            {open.length > 0 ? t("progress", { done, total: open.length }) : t("noOpenLessons")}
          </p>
        </div>
      )}

      {lessons.length === 0 ? <p className="text-[14px] text-muted">{t("emptyProgram")}</p> : null}

      {program.sections
        .filter((section) => section.lessons.length > 0)
        .map((section, index) => (
          <section
            key={section.id}
            className="overflow-hidden rounded-card border border-line bg-card shadow-card"
          >
            <h2 className="flex items-center gap-2 border-b border-line bg-subtle px-4 py-2.5 text-[14px] font-medium">
              <span className="font-mono text-[11px] text-faint tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              {section.title}
            </h2>
            <ol className="divide-y divide-line">
              {section.lessons.map((lesson) => {
                const row = (
                  <>
                    <span
                      className={cn(
                        "flex size-6 flex-none items-center justify-center rounded-full border",
                        lesson.done
                          ? "border-success-line bg-success-soft text-success"
                          : "border-line text-faint",
                      )}
                    >
                      {lesson.done ? (
                        <Check size={13} strokeWidth={2.5} aria-label={t("lessonDone")} />
                      ) : !lesson.unlocked ? (
                        <Lock size={12} strokeWidth={2} aria-label={t("lessonLocked")} />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[14px]",
                        !lesson.unlocked && "text-muted",
                      )}
                    >
                      {lesson.title}
                    </span>
                    {!lesson.published ? (
                      <span className="flex items-center gap-1 text-[12px] text-faint">
                        <EyeOff size={13} strokeWidth={1.75} />
                        {t("lessonHidden")}
                      </span>
                    ) : null}
                    <span className="flex-none text-[12px] text-faint tabular-nums">
                      {t("minutes", { minutes: lesson.durationMinutes })}
                    </span>
                  </>
                );
                return (
                  <li key={lesson.id}>
                    {lesson.unlocked ? (
                      <Link
                        href={`/learn/${program.slug}/${lesson.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3">{row}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
    </div>
  );
}
