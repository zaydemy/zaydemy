"use client";

import type { ClassOverview } from "@zaydemy/core";
import { ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClassDot } from "@/components/class-dot";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { createClassAction } from "../organization-actions";
import { ClassForm } from "./class-form";

export function ClassesView({
  classes,
  canManage,
}: {
  classes: ClassOverview[];
  canManage: boolean;
}) {
  const t = useTranslations("Classes");
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = classes.filter((c) => c.archivedAt).length;
  const visible = classes.filter((c) => showArchived || !c.archivedAt);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h1>
        <div className="ms-auto flex items-center gap-3">
          {archivedCount > 0 ? (
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              {t("showArchived")}
            </label>
          ) : null}
          {canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} strokeWidth={2} />
              {t("create")}
            </Button>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-10 text-center text-[14px] text-muted">
          {canManage ? t("empty") : t("emptyStaff")}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((cls) => (
            <li key={cls.id}>
              <Link
                href={`/classes/${cls.id}`}
                className="group flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3.5 shadow-card transition-colors hover:border-outline"
              >
                <ClassDot id={cls.id} color={cls.color} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{cls.name}</span>
                    {cls.archivedAt ? (
                      <span className="rounded-[6px] border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
                        {t("archived")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-muted">
                    {t(`kinds.${cls.kind}`)} ·{" "}
                    {t("counts", { instructors: cls.instructors, students: cls.students })}
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
        <ClassForm
          withKind
          onSubmit={(values) => createClassAction(values)}
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      </Dialog>
    </div>
  );
}
