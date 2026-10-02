import { getLessonForLearner, getProgramForLearner, toEmbedUrl } from "@zaydemy/core";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HighlightedLessonNote } from "@/components/lesson-note-highlighted";
import { inTenant } from "@/lib/server/tenant";
import { DoneButton } from "./done-button";

const uuid = /^[0-9a-f-]{36}$/i;

async function load(slug: string, lessonId: string) {
  if (!uuid.test(lessonId)) return null;
  return inTenant(async (tx) => {
    const lesson = await getLessonForLearner(tx, lessonId);
    const program = await getProgramForLearner(tx, slug);
    // The lesson must belong to the program in the URL.
    if (
      lesson.status !== "ok" ||
      program.status !== "ok" ||
      lesson.lesson.program.id !== program.program.id
    )
      return null;
    return { lesson: lesson.lesson, program: program.program };
  });
}

export async function generateMetadata({
  params,
}: PageProps<"/learn/[slug]/[lessonId]">): Promise<Metadata> {
  const { slug, lessonId } = await params;
  const data = await load(slug, lessonId);
  return { title: data ? data.lesson.title : undefined };
}

export default async function LearnLessonPage({ params }: PageProps<"/learn/[slug]/[lessonId]">) {
  const { slug, lessonId } = await params;
  const data = await load(slug, lessonId);
  if (!data) notFound();
  const { lesson, program } = data;
  const t = await getTranslations("Learn");

  // Previous and next among the lessons this person can open.
  const openLessons = program.sections.flatMap((s) => s.lessons).filter((l) => l.unlocked);
  const index = openLessons.findIndex((l) => l.id === lesson.id);
  const previous = index > 0 ? openLessons[index - 1] : undefined;
  const next = index >= 0 ? openLessons[index + 1] : undefined;
  const embed = lesson.videoUrl ? toEmbedUrl(lesson.videoUrl) : null;

  return (
    <article className="flex max-w-3xl flex-col gap-6">
      <Link
        href={`/learn/${program.slug}`}
        className="flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-body"
      >
        <ArrowLeft size={15} strokeWidth={1.75} className="rtl:rotate-180" />
        {t("backToProgram", { program: program.title })}
      </Link>

      {lesson.preview ? (
        <p className="rounded-card border border-line bg-subtle px-4 py-2.5 text-[13px] text-muted">
          {t("preview")}
        </p>
      ) : null}

      <header className="flex flex-col gap-1.5">
        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
          {lesson.title}
        </h1>
        <p className="text-[13px] text-muted tabular-nums">
          {t("minutes", { minutes: lesson.durationMinutes })}
        </p>
      </header>

      {embed ? (
        <div className="aspect-video overflow-hidden rounded-card border border-line bg-black">
          <iframe
            src={embed}
            title={t("video")}
            className="size-full"
            loading="lazy"
            allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      ) : lesson.videoUrl ? (
        <a
          href={lesson.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 self-start rounded-card border border-line bg-card px-4 py-2.5 text-[14px] font-medium shadow-card hover:bg-subtle"
        >
          <ExternalLink size={15} strokeWidth={1.75} />
          {t("watchVideo")}
        </a>
      ) : null}

      <div className="rounded-card border border-line bg-card p-5 shadow-card sm:p-7">
        {lesson.note ? (
          <HighlightedLessonNote source={lesson.note} />
        ) : (
          <p className="text-[14px] text-muted">{t("noNote")}</p>
        )}
      </div>

      {lesson.preview ? null : (
        <div className="flex justify-center">
          <DoneButton lessonId={lesson.id} done={lesson.done} />
        </div>
      )}

      <nav aria-label={t("lessonNav")} className="grid gap-3 sm:grid-cols-2">
        {previous ? (
          <Link
            href={`/learn/${program.slug}/${previous.id}`}
            className="flex flex-col gap-0.5 rounded-card border border-line bg-card px-4 py-3 shadow-card hover:border-outline"
          >
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              <ArrowLeft size={13} strokeWidth={1.75} className="rtl:rotate-180" />
              {t("previous")}
            </span>
            <span className="truncate text-[14px] font-medium">{previous.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/learn/${program.slug}/${next.id}`}
            className="flex flex-col items-end gap-0.5 rounded-card border border-line bg-card px-4 py-3 text-end shadow-card hover:border-outline"
          >
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              {t("next")}
              <ArrowRight size={13} strokeWidth={1.75} className="rtl:rotate-180" />
            </span>
            <span className="truncate text-[14px] font-medium">{next.title}</span>
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
