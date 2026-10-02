"use client";

import type { ProgramSummary } from "@zaydemy/core";
import { ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorNote } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import { useCurriculumError } from "@/lib/use-curriculum-error";
import { fieldClass } from "../classes/class-form";
import { createProgramAction } from "./actions";

export function StatusBadge({ status, label }: { status: "draft" | "published"; label: string }) {
  return (
    <span
      className={cn(
        "rounded-chip border px-2 py-0.5 text-[11.5px] font-medium",
        status === "published"
          ? "border-success-line bg-success-soft text-success"
          : "border-line bg-subtle text-muted",
      )}
    >
      {label}
    </span>
  );
}

export function ProgramsView({
  programs,
  canAuthor,
}: {
  programs: ProgramSummary[];
  canAuthor: boolean;
}) {
  const t = useTranslations("Programs");
  const tCommon = useTranslations("Common");
  const describe = useCurriculumError();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    start(async () => {
      const result = await createProgramAction({
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
      });
      if (result.ok) router.push(`/programs/${result.slug}`);
      else setError(describe(result.error));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h1>
        {canAuthor ? (
          <Button className="ms-auto" onClick={() => setCreating(true)}>
            <Plus size={16} strokeWidth={2} />
            {t("create")}
          </Button>
        ) : null}
      </div>

      {programs.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-10 text-center text-[14px] text-muted">
          {canAuthor ? t("empty") : t("emptyInstructor")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {programs.map((program) => (
            <li key={program.id}>
              <Link
                href={`/programs/${program.slug}`}
                className="group flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3.5 shadow-card transition-colors hover:border-outline"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{program.title}</span>
                    <StatusBadge status={program.status} label={t(`status.${program.status}`)} />
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">
                    {t("summary", { lessons: program.lessons, enrollments: program.enrollments })}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={1.75}
                  className="text-faint group-hover:text-body rtl:rotate-180"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title={t("createTitle")}>
        <form onSubmit={create} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">{t("name")}</span>
            <input
              name="title"
              required
              autoFocus
              maxLength={160}
              placeholder={t("namePlaceholder")}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">{t("description")}</span>
            <textarea name="description" rows={3} className={cn(fieldClass, "h-auto py-2.5")} />
            <span className="text-[12px] text-muted">{t("descriptionHint")}</span>
          </label>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={() => setCreating(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? tCommon("saving") : tCommon("save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
