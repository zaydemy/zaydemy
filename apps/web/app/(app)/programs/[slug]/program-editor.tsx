"use client";

import type { EnrollmentRow, ProgramOutline } from "@zaydemy/core";
import type { AccessMode } from "@zaydemy/db/schema";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorNote, Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import { useCurriculumError } from "@/lib/use-curriculum-error";
import { fieldClass } from "../../classes/class-form";
import {
  addLessonAction,
  addSectionAction,
  assignProgramAction,
  deleteLessonAction,
  deleteProgramAction,
  deleteSectionAction,
  moveLessonAction,
  moveSectionAction,
  removeEnrollmentAction,
  renameSectionAction,
  setAccessModeAction,
  setPrerequisiteAction,
  setProgramStatusAction,
  updateProgramAction,
  type CurriculumResult,
  type DeleteResult,
} from "../actions";
import { StatusBadge } from "../programs-view";

const accessModes: AccessMode[] = ["open", "selected"];
const smallField = cn(fieldClass, "h-9 rounded-[10px] text-[13px]");

export interface AssignTarget {
  id: string;
  name: string;
}

export function ProgramEditor({
  program,
  enrollments,
  related,
  classes,
  students,
  canAuthor,
}: {
  program: ProgramOutline;
  enrollments: EnrollmentRow[];
  /** Every enrollment of the same classes and students, other programs included. */
  related: EnrollmentRow[];
  /** Classes and students the viewer may assign to. */
  classes: AssignTarget[];
  students: AssignTarget[];
  canAuthor: boolean;
}) {
  const t = useTranslations("Programs");
  const tLearn = useTranslations("Learn");
  const describe = useCurriculumError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function run(action: () => Promise<CurriculumResult>, after?: () => void) {
    setError(null);
    start(async () => {
      const result = await action();
      if (result.ok) {
        after?.();
        router.refresh();
      } else setError(describe(result.error));
    });
  }

  /** Deletes ask once, and once more when the content is in use. */
  function remove(
    question: string,
    action: (force: boolean) => Promise<DeleteResult>,
    inUse: (r: { enrollments: number; completions: number }) => string,
    after?: () => void,
  ) {
    if (!window.confirm(question)) return;
    setError(null);
    start(async () => {
      let result = await action(false);
      if (!result.ok && result.error === "in-use") {
        if (!window.confirm(inUse(result))) return;
        result = await action(true);
      }
      if (result.ok) {
        if (after) after();
        else router.refresh();
      } else if (result.error !== "in-use") setError(describe(result.error));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/programs"
        className="flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-body"
      >
        <ArrowLeft size={15} strokeWidth={1.75} className="rtl:rotate-180" />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
              {program.title}
            </h1>
            <StatusBadge status={program.status} label={t(`status.${program.status}`)} />
          </div>
          {program.description ? (
            <p className="mt-1.5 text-[14px] text-muted">{program.description}</p>
          ) : null}
        </div>
        <Link
          href={`/learn/${program.slug}`}
          className="flex h-8 items-center gap-1.5 rounded-[10px] border border-line bg-card px-3 text-[13px] font-medium shadow-card hover:bg-subtle"
        >
          <Eye size={14} strokeWidth={1.75} />
          {tLearn("previewLink")}
        </Link>
        {canAuthor ? (
          <div className="flex flex-wrap gap-2">
            <Button tone="secondary" size="sm" onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
            <Button
              size="sm"
              tone={program.status === "published" ? "secondary" : "primary"}
              disabled={pending}
              onClick={() =>
                run(() =>
                  setProgramStatusAction(
                    program.id,
                    program.status === "published" ? "draft" : "published",
                  ),
                )
              }
            >
              {program.status === "published" ? t("unpublish") : t("publish")}
            </Button>
            <Button
              tone="ghost"
              size="sm"
              disabled={pending}
              className="hover:text-danger"
              onClick={() =>
                remove(
                  t("deleteConfirm", { title: program.title }),
                  (force) => deleteProgramAction(program.id, force),
                  (r) => t("deleteInUse", r),
                  () => router.replace("/programs"),
                )
              }
            >
              {t("delete")}
            </Button>
          </div>
        ) : null}
      </div>

      {program.status === "draft" ? (
        <p className="rounded-card border border-warning-line bg-warning-soft px-4 py-2.5 text-[13px] text-warning">
          {t("draftNote")}
        </p>
      ) : null}
      {!canAuthor ? <p className="text-[13px] text-muted">{t("curriculum.readOnly")}</p> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Section title={t("curriculum.title")}>
        <div className="flex flex-col divide-y divide-line">
          {program.sections.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted">{t("curriculum.empty")}</p>
          ) : null}
          {program.sections.map((section, sectionIndex) => (
            <div key={section.id} className="flex flex-col">
              <div className="flex items-center gap-2 bg-subtle px-4 py-2.5">
                <span className="font-mono text-[11px] text-faint tabular-nums">
                  {String(sectionIndex + 1).padStart(2, "0")}
                </span>
                <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{section.title}</h3>
                {canAuthor ? (
                  <RowTools
                    disabled={pending}
                    first={sectionIndex === 0}
                    last={sectionIndex === program.sections.length - 1}
                    labels={{
                      up: t("curriculum.moveUp"),
                      down: t("curriculum.moveDown"),
                      remove: t("curriculum.deleteSection"),
                    }}
                    onMove={(direction) => run(() => moveSectionAction(section.id, direction))}
                    onRemove={() =>
                      remove(
                        t("curriculum.deleteSectionConfirm", { title: section.title }),
                        (force) => deleteSectionAction(section.id, force),
                        (r) => t("curriculum.deleteInUse", r),
                      )
                    }
                  >
                    <IconButton
                      label={t("curriculum.rename")}
                      disabled={pending}
                      onClick={() => {
                        const title = window.prompt(t("curriculum.rename"), section.title);
                        if (title !== null) run(() => renameSectionAction(section.id, title));
                      }}
                    >
                      <Pencil size={14} strokeWidth={1.75} />
                    </IconButton>
                  </RowTools>
                ) : null}
              </div>

              <ul className="divide-y divide-line">
                {section.lessons.length === 0 ? (
                  <li className="px-4 py-3 text-[13px] text-muted">
                    {t("curriculum.emptySection")}
                  </li>
                ) : null}
                {section.lessons.map((lesson, lessonIndex) => (
                  <li key={lesson.id} className="flex items-center gap-2 px-4 py-2">
                    <Link
                      href={`/programs/${program.slug}/lessons/${lesson.id}`}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-chip py-1 hover:underline"
                    >
                      <span
                        className={cn("truncate text-[14px]", !lesson.published && "text-muted")}
                      >
                        {lesson.title}
                      </span>
                      {lesson.hasNote ? (
                        <FileText
                          size={13}
                          strokeWidth={1.75}
                          className="flex-none text-faint"
                          aria-label={t("curriculum.hasNote")}
                        />
                      ) : null}
                      {lesson.hasVideo ? (
                        <Video
                          size={13}
                          strokeWidth={1.75}
                          className="flex-none text-faint"
                          aria-label={t("curriculum.hasVideo")}
                        />
                      ) : null}
                      {!lesson.published ? (
                        <span className="rounded-[6px] border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
                          {t("curriculum.unpublished")}
                        </span>
                      ) : null}
                    </Link>
                    <span className="flex-none text-[12px] text-faint tabular-nums">
                      {t("curriculum.minutes", { minutes: lesson.durationMinutes })}
                    </span>
                    {canAuthor ? (
                      <RowTools
                        disabled={pending}
                        first={lessonIndex === 0}
                        last={lessonIndex === section.lessons.length - 1}
                        labels={{
                          up: t("curriculum.moveUp"),
                          down: t("curriculum.moveDown"),
                          remove: t("curriculum.deleteLesson"),
                        }}
                        onMove={(direction) => run(() => moveLessonAction(lesson.id, direction))}
                        onRemove={() =>
                          remove(
                            t("curriculum.deleteLessonConfirm", { title: lesson.title }),
                            (force) => deleteLessonAction(lesson.id, force),
                            (r) => t("curriculum.deleteInUse", r),
                          )
                        }
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
              {canAuthor ? (
                <InlineAdd
                  placeholder={t("curriculum.lessonPlaceholder")}
                  label={t("curriculum.addLesson")}
                  disabled={pending}
                  onAdd={(title, reset) => run(() => addLessonAction(section.id, title), reset)}
                />
              ) : null}
            </div>
          ))}
          {canAuthor ? (
            <InlineAdd
              placeholder={t("curriculum.sectionPlaceholder")}
              label={t("curriculum.addSection")}
              disabled={pending}
              onAdd={(title, reset) => run(() => addSectionAction(program.id, title), reset)}
            />
          ) : null}
        </div>
      </Section>

      <Assignments
        program={program}
        enrollments={enrollments}
        related={related}
        classes={classes}
        students={students}
        run={run}
        pending={pending}
      />

      <Dialog open={editing} onClose={() => setEditing(false)} title={t("edit")}>
        <DetailsForm
          program={program}
          onCancel={() => setEditing(false)}
          onSaved={(slug) => {
            setEditing(false);
            if (slug !== program.slug) router.replace(`/programs/${slug}`);
            else router.refresh();
          }}
        />
      </Dialog>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
  danger,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-chip text-faint transition-colors disabled:opacity-30",
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-subtle-2 hover:text-body",
      )}
    >
      {children}
    </button>
  );
}

function RowTools({
  disabled,
  first,
  last,
  labels,
  onMove,
  onRemove,
  children,
}: {
  disabled: boolean;
  first: boolean;
  last: boolean;
  labels: { up: string; down: string; remove: string };
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  return (
    <span className="flex flex-none items-center">
      {children}
      <IconButton label={labels.up} disabled={disabled || first} onClick={() => onMove(-1)}>
        <ArrowUp size={14} strokeWidth={1.75} />
      </IconButton>
      <IconButton label={labels.down} disabled={disabled || last} onClick={() => onMove(1)}>
        <ArrowDown size={14} strokeWidth={1.75} />
      </IconButton>
      <IconButton label={labels.remove} disabled={disabled} onClick={onRemove} danger>
        <Trash2 size={14} strokeWidth={1.75} />
      </IconButton>
    </span>
  );
}

function InlineAdd({
  placeholder,
  label,
  disabled,
  onAdd,
}: {
  placeholder: string;
  label: string;
  disabled: boolean;
  onAdd: (title: string, reset: () => void) => void;
}) {
  const [title, setTitle] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) onAdd(title, () => setTitle(""));
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-4 py-2.5">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        maxLength={160}
        className={cn(smallField, "flex-1")}
      />
      {/* Not disabled while another change is saving: Enter on a disabled
          submit button does nothing, and a fast typist would lose the row. */}
      <Button
        type="submit"
        size="sm"
        tone="secondary"
        disabled={!title.trim()}
        aria-busy={disabled}
      >
        <Plus size={14} strokeWidth={2} />
        {label}
      </Button>
    </form>
  );
}

function DetailsForm({
  program,
  onCancel,
  onSaved,
}: {
  program: ProgramOutline;
  onCancel: () => void;
  onSaved: (slug: string) => void;
}) {
  const t = useTranslations("Programs");
  const tCommon = useTranslations("Common");
  const describe = useCurriculumError();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    start(async () => {
      const result = await updateProgramAction(program.id, {
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        slug: String(form.get("slug") ?? ""),
      });
      if (result.ok) onSaved(result.slug);
      else setError(describe(result.error));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{t("name")}</span>
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={program.title}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{t("description")}</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={program.description}
          className={cn(fieldClass, "h-auto py-2.5")}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{t("slug")}</span>
        <input
          name="slug"
          required
          defaultValue={program.slug}
          className={cn(fieldClass, "font-mono text-[13px]")}
        />
        <span className="text-[12px] text-muted">{t("slugHint", { slug: program.slug })}</span>
      </label>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div className="flex justify-end gap-2">
        <Button tone="ghost" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}

function Assignments({
  program,
  enrollments,
  related,
  classes,
  students,
  run,
  pending,
}: {
  program: ProgramOutline;
  enrollments: EnrollmentRow[];
  related: EnrollmentRow[];
  classes: AssignTarget[];
  students: AssignTarget[];
  run: (action: () => Promise<CurriculumResult>, after?: () => void) => void;
  pending: boolean;
}) {
  const t = useTranslations("Programs.assignments");
  const [target, setTarget] = useState("");
  const assigned = new Set(enrollments.map((e) => e.teamId ?? e.userId));
  const freeClasses = classes.filter((c) => !assigned.has(c.id));
  const freeStudents = students.filter((s) => !assigned.has(s.id));

  function assign() {
    const [kind, id] = target.split(":");
    if (!id) return;
    run(
      () => assignProgramAction(program.id, kind === "team" ? { teamId: id } : { userId: id }),
      () => setTarget(""),
    );
  }

  return (
    <Section title={t("title")} meta={enrollments.length > 0 ? enrollments.length : null}>
      {enrollments.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {enrollments.map((enrollment) => {
            // A prerequisite is another program given to the same class or student.
            const siblings = related.filter(
              (e) =>
                e.id !== enrollment.id &&
                e.teamId === enrollment.teamId &&
                e.userId === enrollment.userId,
            );
            return (
              <li key={enrollment.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="min-w-40 flex-1 truncate text-[14px] font-medium">
                  {enrollment.targetName}
                </span>
                <select
                  aria-label={`${t("access")}: ${enrollment.targetName}`}
                  value={enrollment.accessMode}
                  disabled={pending}
                  onChange={(event) =>
                    run(() => setAccessModeAction(enrollment.id, event.target.value as AccessMode))
                  }
                  className={cn(smallField, "w-auto pe-8")}
                >
                  {accessModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`mode.${mode}`)}
                    </option>
                  ))}
                </select>
                {siblings.length > 0 ? (
                  <select
                    aria-label={`${t("prerequisite")}: ${enrollment.targetName}`}
                    value={enrollment.requiresEnrollmentId ?? ""}
                    disabled={pending}
                    onChange={(event) =>
                      run(() => setPrerequisiteAction(enrollment.id, event.target.value || null))
                    }
                    className={cn(smallField, "w-auto pe-8")}
                  >
                    <option value="">{t("noPrerequisite")}</option>
                    {siblings.map((s) => (
                      <option
                        key={s.id}
                        value={s.id}
                      >{`${t("prerequisite")}: ${s.programTitle}`}</option>
                    ))}
                  </select>
                ) : null}
                <Link
                  href={`/programs/${program.slug}/access/${enrollment.id}`}
                  className="flex h-8 items-center rounded-[10px] border border-line bg-card px-3 text-[13px] font-medium shadow-card hover:bg-subtle"
                >
                  {t("access")}
                </Link>
                <Button
                  tone="ghost"
                  size="sm"
                  disabled={pending}
                  className="hover:text-danger"
                  onClick={() =>
                    window.confirm(t("removeConfirm", { name: enrollment.targetName })) &&
                    run(() => removeEnrollmentAction(enrollment.id))
                  }
                >
                  {t("remove")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {freeClasses.length + freeStudents.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <select
            aria-label={t("choose")}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className={cn(smallField, "min-w-56 flex-1 pe-8")}
          >
            <option value="">{t("choose")}</option>
            {freeClasses.length > 0 ? (
              <optgroup label={t("classes")}>
                {freeClasses.map((c) => (
                  <option key={c.id} value={`team:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {freeStudents.length > 0 ? (
              <optgroup label={t("students")}>
                {freeStudents.map((s) => (
                  <option key={s.id} value={`user:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <Button size="sm" disabled={pending || !target} onClick={assign}>
            {t("assign")}
          </Button>
        </div>
      ) : null}
    </Section>
  );
}
