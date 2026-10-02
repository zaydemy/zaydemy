"use client";

import type { EnrollmentLessonState, ProgramOutline } from "@zaydemy/core";
import type { AccessMode } from "@zaydemy/db/schema";
import { ArrowLeft, Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote, Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import { useCurriculumError } from "@/lib/use-curriculum-error";
import { fieldClass } from "../../../../classes/class-form";
import {
  setAccessModeAction,
  setLessonAccessAction,
  setLessonVideoAction,
  type CurriculumResult,
} from "../../../actions";

const modes: AccessMode[] = ["open", "selected"];
const overrides = [
  { value: true, key: "open" },
  { value: false, key: "locked" },
  { value: null, key: "default" },
] as const;

export function AccessEditor({
  program,
  enrollmentId,
  targetName,
  accessMode,
  lessons,
}: {
  program: ProgramOutline;
  enrollmentId: string;
  targetName: string;
  accessMode: AccessMode;
  lessons: EnrollmentLessonState[];
}) {
  const t = useTranslations("Programs.access");
  const tAssign = useTranslations("Programs.assignments");
  const describe = useCurriculumError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const stateOf = new Map(lessons.map((l) => [l.lessonId, l]));

  function run(action: () => Promise<CurriculumResult>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(describe(result.error));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/programs/${program.slug}`}
        className="flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-body"
      >
        <ArrowLeft size={15} strokeWidth={1.75} className="rtl:rotate-180" />
        {t("back")}
      </Link>
      <div>
        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
          {t("title", { target: targetName })}
        </h1>
        <p className="mt-1 text-[14px] text-muted">{program.title}</p>
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Section title={t("mode")}>
        <div role="radiogroup" aria-label={t("mode")} className="grid gap-2 p-4 sm:grid-cols-2">
          {modes.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={accessMode === mode}
              disabled={pending}
              onClick={() =>
                accessMode !== mode && run(() => setAccessModeAction(enrollmentId, mode))
              }
              className="flex flex-col items-start gap-0.5 rounded-card border border-line px-3.5 py-2.5 text-start transition-colors hover:border-outline aria-checked:border-body aria-checked:bg-subtle"
            >
              <span className="text-[14px] font-medium">{tAssign(`mode.${mode}`)}</span>
              <span className="text-[12.5px] text-muted">
                {mode === "open" ? t("modeOpenHint") : t("modeSelectedHint")}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {program.sections.map((section) => (
        <Section
          key={section.id}
          title={section.title}
          action={
            <span className="flex gap-1">
              <Button
                size="sm"
                tone="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => setLessonAccessAction(enrollmentId, { sectionId: section.id }, true))
                }
              >
                {t("openAll")}
              </Button>
              <Button
                size="sm"
                tone="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => setLessonAccessAction(enrollmentId, { sectionId: section.id }, false))
                }
              >
                {t("lockAll")}
              </Button>
              <Button
                size="sm"
                tone="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => setLessonAccessAction(enrollmentId, { sectionId: section.id }, null))
                }
              >
                {t("resetAll")}
              </Button>
            </span>
          }
        >
          <ul className="divide-y divide-line">
            {section.lessons.map((lesson) => {
              const state = stateOf.get(lesson.id);
              const unlocked = state?.unlocked ?? accessMode === "open";
              return (
                <li key={lesson.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={cn("flex-none", unlocked ? "text-success" : "text-faint")}
                      title={t("state", { unlocked: String(unlocked) })}
                    >
                      {unlocked ? (
                        <LockOpen size={15} strokeWidth={1.75} />
                      ) : (
                        <Lock size={15} strokeWidth={1.75} />
                      )}
                    </span>
                    <span className={cn("min-w-40 flex-1 text-[14px]", !unlocked && "text-muted")}>
                      {lesson.title}
                    </span>
                    <div
                      role="radiogroup"
                      aria-label={lesson.title}
                      className="flex overflow-hidden rounded-[10px] border border-line"
                    >
                      {overrides.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          role="radio"
                          aria-checked={(state?.override ?? null) === option.value}
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              setLessonAccessAction(
                                enrollmentId,
                                { lessonId: lesson.id },
                                option.value,
                              ),
                            )
                          }
                          className="h-8 border-e border-line px-3 text-[12.5px] text-muted last:border-e-0 hover:bg-subtle aria-checked:bg-subtle-2 aria-checked:font-medium aria-checked:text-body"
                        >
                          {t(option.key)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <form
                    className="flex items-center gap-2 ps-7"
                    action={(form) =>
                      run(() =>
                        setLessonVideoAction(
                          enrollmentId,
                          lesson.id,
                          String(form.get("video") ?? ""),
                        ),
                      )
                    }
                  >
                    <input
                      name="video"
                      type="url"
                      defaultValue={state?.videoUrl ?? ""}
                      placeholder={t("videoPlaceholder")}
                      aria-label={`${t("video")}: ${lesson.title}`}
                      className={cn(fieldClass, "h-8 flex-1 rounded-[10px] text-[12.5px]")}
                    />
                    <Button type="submit" size="sm" tone="ghost" disabled={pending}>
                      {t("videoSave")}
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
    </div>
  );
}
