"use client";

import type { ClassRoster } from "@zaydemy/core";
import type { MemberRole } from "@zaydemy/db/schema";
import { ArrowLeft, UserMinus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClassDot } from "@/components/class-dot";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorNote, Section } from "@/components/ui/section";
import { useActionError } from "@/lib/use-action-error";
import {
  addToClassAction,
  deleteClassAction,
  removeFromClassAction,
  setClassArchivedAction,
  updateClassAction,
  type ActionResult,
} from "../../organization-actions";
import { ClassForm } from "../class-form";

const roleOrder: Record<MemberRole, number> = { owner: 0, admin: 1, instructor: 2, student: 3 };

export function ClassDetail({
  roster,
  candidates,
  canManage,
  showRoles,
}: {
  roster: ClassRoster;
  /** Organization members not in this class whom the viewer may add. */
  candidates: { userId: string; name: string; email: string; role: MemberRole }[];
  canManage: boolean;
  showRoles: boolean;
}) {
  const t = useTranslations("Classes");
  const tRoles = useTranslations("Roles");
  const tStatus = useTranslations("Statuses");
  const describe = useActionError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    start(async () => {
      const result = await action();
      if (result.ok) {
        after?.();
        router.refresh();
      } else setError(describe(result.error));
    });
  }

  function remove() {
    if (!window.confirm(t("deleteConfirm", { name: roster.name }))) return;
    setError(null);
    start(async () => {
      let result = await deleteClassAction(roster.id, false);
      if (!result.ok && result.error === "not-empty") {
        if (
          !window.confirm(
            t("deleteNotEmpty", { members: "members" in result ? result.members : 0 }),
          )
        )
          return;
        result = await deleteClassAction(roster.id, true);
      }
      if (result.ok) router.replace("/classes");
      else if (result.error !== "not-empty") setError(describe(result.error));
    });
  }

  const members = [...roster.members].sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/classes"
        className="flex items-center gap-1.5 self-start text-[13px] text-muted hover:text-body"
      >
        <ArrowLeft size={15} strokeWidth={1.75} className="rtl:rotate-180" />
        {t("back")}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <ClassDot id={roster.id} color={roster.color} className="size-3.5" />
        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
          {roster.name}
        </h1>
        <span className="text-[13px] text-muted">{t(`kinds.${roster.kind}`)}</span>
        {roster.archivedAt ? (
          <span className="rounded-[6px] border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
            {t("archived")}
          </span>
        ) : null}
        {canManage ? (
          <div className="ms-auto flex gap-2">
            <Button tone="secondary" size="sm" onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
            <Button
              tone="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setClassArchivedAction(roster.id, !roster.archivedAt))}
            >
              {roster.archivedAt ? t("unarchive") : t("archive")}
            </Button>
            <Button
              tone="ghost"
              size="sm"
              disabled={pending}
              onClick={remove}
              className="hover:text-danger"
            >
              {t("delete")}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Section
        title={t("roster")}
        meta={members.length}
        action={
          <Button size="sm" onClick={() => setAdding(true)} disabled={candidates.length === 0}>
            <UserPlus size={15} strokeWidth={1.75} />
            {t("addExisting")}
          </Button>
        }
      >
        {members.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-muted">{t("rosterEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{m.name}</span>
                  <span className="block truncate font-mono text-[11.5px] text-faint">
                    {m.email}
                  </span>
                </span>
                {showRoles ? (
                  <span className="text-[12px] text-muted">{tRoles(m.role)}</span>
                ) : null}
                {m.status === "passive" ? (
                  <span className="rounded-chip border border-warning-line bg-warning-soft px-2 py-0.5 text-[11px] text-warning">
                    {tStatus("passive")}
                  </span>
                ) : null}
                <button
                  type="button"
                  title={t("removeFromClass")}
                  aria-label={`${t("removeFromClass")}: ${m.name}`}
                  disabled={pending}
                  onClick={() =>
                    window.confirm(t("removeConfirm", { name: m.name })) &&
                    run(() => removeFromClassAction([m.userId], roster.id))
                  }
                  className="flex size-8 items-center justify-center rounded-chip text-faint hover:bg-danger-soft hover:text-danger"
                >
                  <UserMinus size={15} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Dialog open={editing} onClose={() => setEditing(false)} title={t("edit")}>
        <ClassForm
          initial={roster}
          withKind={false}
          onSubmit={(values) =>
            updateClassAction(roster.id, { name: values.name, color: values.color })
          }
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      </Dialog>

      <Dialog
        open={adding}
        onClose={() => {
          setAdding(false);
          setPicked([]);
        }}
        title={t("addExisting")}
      >
        <p className="mb-3 text-[13px] text-muted">
          {candidates.length > 0 ? t("addExistingHint") : t("addExistingEmpty")}
        </p>
        <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-card border border-line">
          {candidates.map((c) => (
            <li key={c.userId}>
              <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-subtle">
                <input
                  type="checkbox"
                  checked={picked.includes(c.userId)}
                  onChange={(event) =>
                    setPicked((current) =>
                      event.target.checked
                        ? [...current, c.userId]
                        : current.filter((id) => id !== c.userId),
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{c.name}</span>
                  <span className="block truncate font-mono text-[11.5px] text-faint">
                    {c.email}
                  </span>
                </span>
                {showRoles ? (
                  <span className="text-[12px] text-muted">{tRoles(c.role)}</span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={pending || picked.length === 0}
            onClick={() =>
              run(
                () => addToClassAction(picked, roster.id),
                () => {
                  setAdding(false);
                  setPicked([]);
                },
              )
            }
          >
            {t("addExisting")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
