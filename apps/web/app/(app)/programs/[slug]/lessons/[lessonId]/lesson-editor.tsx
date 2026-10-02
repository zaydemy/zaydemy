"use client";

import { ArrowLeft, History } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { LessonNote } from "@/components/lesson-note";
import { Button } from "@/components/ui/button";
import { ErrorNote, Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import { useCurriculumError } from "@/lib/use-curriculum-error";
import { fieldClass } from "../../../../classes/class-form";
import { restoreLessonNoteAction, updateLessonAction } from "../../../actions";

const tabs = ["write", "preview"] as const;

export interface EditableLesson {
  id: string;
  title: string;
  durationMinutes: number;
  published: boolean;
  videoUrl: string | null;
  note: string | null;
}

export interface Revision {
  id: string;
  note: string;
  createdAt: Date;
  author: string | null;
}

export function LessonEditor({
  slug,
  lesson,
  revisions,
  canAuthor,
}: {
  slug: string;
  lesson: EditableLesson;
  revisions: Revision[];
  canAuthor: boolean;
}) {
  const t = useTranslations("Programs.lesson");
  const format = useFormatter();
  const describe = useCurriculumError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState(lesson.note ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage(null);
    start(async () => {
      const result = await updateLessonAction(lesson.id, {
        title: String(form.get("title") ?? ""),
        durationMinutes: Number(form.get("duration") ?? 0),
        published: form.get("published") === "on",
        videoUrl: String(form.get("video") ?? ""),
        note,
      });
      setMessage(
        result.ok ? { ok: true, text: t("saved") } : { ok: false, text: describe(result.error) },
      );
      if (result.ok) router.refresh();
    });
  }

  function restore(revision: Revision) {
    if (!window.confirm(t("restoreConfirm"))) return;
    setMessage(null);
    start(async () => {
      const result = await restoreLessonNoteAction(lesson.id, revision.id);
      if (result.ok) {
        setNote(revision.note);
        router.refresh();
      } else setMessage({ ok: false, text: describe(result.error) });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/programs/${slug}`}
        className="flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-body"
      >
        <ArrowLeft size={15} strokeWidth={1.75} className="rtl:rotate-180" />
        {t("back")}
      </Link>

      {canAuthor ? (
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">{t("title")}</span>
              <input
                name="title"
                required
                maxLength={160}
                defaultValue={lesson.title}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">{t("duration")}</span>
              <input
                name="duration"
                type="number"
                min={0}
                max={1440}
                defaultValue={lesson.durationMinutes}
                className={cn(fieldClass, "sm:w-40")}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">{t("video")}</span>
            <input
              name="video"
              type="url"
              inputMode="url"
              defaultValue={lesson.videoUrl ?? ""}
              className={fieldClass}
            />
            <span className="text-[12px] text-muted">{t("videoHint")}</span>
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" name="published" defaultChecked={lesson.published} />
            {t("published")}
          </label>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium">{t("note")}</span>
              <div role="tablist" className="ms-auto flex gap-1">
                {tabs.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={tab === name}
                    onClick={() => setTab(name)}
                    className="h-8 rounded-[10px] px-3 text-[13px] text-muted hover:bg-subtle-2 aria-selected:bg-subtle-2 aria-selected:font-medium aria-selected:text-body"
                  >
                    {t(name)}
                  </button>
                ))}
              </div>
            </div>
            {tab === "write" ? (
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={20}
                spellCheck
                aria-label={t("note")}
                className={cn(
                  fieldClass,
                  "h-auto min-h-80 py-3 font-mono text-[13px] leading-relaxed",
                )}
              />
            ) : (
              <div className="min-h-80 rounded-field border border-line bg-card p-5">
                {note.trim() ? (
                  <LessonNote source={note} />
                ) : (
                  <p className="text-[13px] text-muted">{t("previewEmpty")}</p>
                )}
              </div>
            )}
            <span className="text-[12px] text-muted">{t("noteHint")}</span>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
            {message ? (
              message.ok ? (
                <span className="text-[13px] text-success">{message.text}</span>
              ) : (
                <ErrorNote>{message.text}</ErrorNote>
              )
            ) : null}
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted">{t("readOnly")}</p>
          <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
            {lesson.title}
          </h1>
          <div className="rounded-card border border-line bg-card p-5 shadow-card">
            {lesson.note ? (
              <LessonNote source={lesson.note} />
            ) : (
              <p className="text-[13px] text-muted">{t("previewEmpty")}</p>
            )}
          </div>
        </div>
      )}

      {canAuthor ? (
        <Section title={t("revisions")} meta={revisions.length > 0 ? revisions.length : null}>
          {revisions.length === 0 ? (
            <p className="px-4 py-5 text-[13px] text-muted">{t("revisionsEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {revisions.map((revision) => (
                <li key={revision.id} className="flex items-center gap-3 px-4 py-2.5">
                  <History size={15} strokeWidth={1.75} className="flex-none text-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-muted">
                      {t("revisionBy", {
                        date: format.dateTime(revision.createdAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                        author: revision.author ?? t("revisionUnknownAuthor"),
                      })}
                    </span>
                    <span className="block truncate font-mono text-[12px] text-faint">
                      {revision.note.slice(0, 120)}
                    </span>
                  </span>
                  <Button
                    tone="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => restore(revision)}
                  >
                    {t("restore")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </div>
  );
}
