"use client";

import type { ClassOverview, PersonRow } from "@zaydemy/core";
import type { MemberRole, MemberStatus } from "@zaydemy/db/schema";
import { Search, UserPlus } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { ClassDot } from "@/components/class-dot";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorNote } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import { useActionError } from "@/lib/use-action-error";
import { fieldClass } from "../classes/class-form";
import {
  addPersonAction,
  addToClassAction,
  removeFromClassAction,
  removeMembersAction,
  setMemberRoleAction,
  setMemberStatusAction,
  type ActionResult,
} from "../organization-actions";

const roles: MemberRole[] = ["owner", "admin", "instructor", "student"];
const statuses: MemberStatus[] = ["active", "passive"];
const selectClass = cn(fieldClass, "h-9 w-auto rounded-[10px] pe-8 text-[13px]");

export function PeopleView({
  people,
  classes,
  me,
  assignable,
  canManage,
  showRoles,
}: {
  people: PersonRow[];
  classes: ClassOverview[];
  me: string;
  /** Roles the viewer may give. */
  assignable: MemberRole[];
  /** Owners and admins: remove members, see everyone. */
  canManage: boolean;
  /** Hidden for individual instructors, who have only students. */
  showRoles: boolean;
}) {
  const t = useTranslations("People");
  const tRoles = useTranslations("Roles");
  const tStatus = useTranslations("Statuses");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const locale = useLocale();
  const describe = useActionError();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<MemberRole | "">("");
  const [status, setStatus] = useState<MemberStatus | "">("active");
  const [classId, setClassId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkClass, setBulkClass] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "warning" | "danger";
    text: string;
  } | null>(null);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  // Locale-aware, case-insensitive matching (Turkish İ/ı included).
  const needle = query.trim().toLocaleLowerCase(locale);
  const collator = useMemo(() => new Intl.Collator(locale, { sensitivity: "base" }), [locale]);
  const visible = people
    .filter(
      (p) =>
        (!needle ||
          p.name.toLocaleLowerCase(locale).includes(needle) ||
          p.email.includes(needle)) &&
        (!role || p.role === role) &&
        (!status || p.status === status) &&
        (!classId || p.classIds.includes(classId)),
    )
    .sort((a, b) => collator.compare(a.name, b.name));
  const selectable = visible.filter((p) => p.userId !== me);
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.includes(p.userId));

  function run(action: () => Promise<ActionResult>) {
    setNotice(null);
    start(async () => {
      const result = await action();
      if (result.ok) {
        setSelected([]);
        router.refresh();
      } else setNotice({ tone: "danger", text: describe(result.error) });
    });
  }

  const bulk = {
    addToClass: () => bulkClass && run(() => addToClassAction(selected, bulkClass)),
    removeFromClass: () => bulkClass && run(() => removeFromClassAction(selected, bulkClass)),
    passive: () =>
      window.confirm(t("bulk.passiveConfirm", { count: selected.length })) &&
      run(() => setMemberStatusAction(selected, "passive")),
    active: () => run(() => setMemberStatusAction(selected, "active")),
    remove: () =>
      window.confirm(t("bulk.removeConfirm", { count: selected.length })) &&
      run(() => removeMembersAction(selected)),
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.015em]">
          {t("title")}
        </h1>
        <Button className="ms-auto" onClick={() => setAdding(true)}>
          <UserPlus size={16} strokeWidth={1.75} />
          {t("add")}
        </Button>
      </div>

      {notice ? (
        <p
          role="status"
          className={cn(
            "rounded-card border px-4 py-2.5 text-[13px]",
            notice.tone === "success" && "border-success-line bg-success-soft text-success",
            notice.tone === "warning" && "border-warning-line bg-warning-soft text-warning",
            notice.tone === "danger" && "border-danger-line bg-danger-soft text-danger",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <Search
            size={15}
            strokeWidth={1.75}
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("filters.search")}
            aria-label={t("filters.search")}
            className={cn(fieldClass, "h-9 rounded-[10px] ps-9 text-[13px]")}
          />
        </label>
        {showRoles ? (
          <select
            aria-label={t("filters.role")}
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole | "")}
            className={selectClass}
          >
            <option value="">{`${t("filters.role")}: ${tCommon("all")}`}</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)}
              </option>
            ))}
          </select>
        ) : null}
        <select
          aria-label={t("filters.status")}
          value={status}
          onChange={(e) => setStatus(e.target.value as MemberStatus | "")}
          className={selectClass}
        >
          <option value="">{`${t("filters.status")}: ${tCommon("all")}`}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("filters.class")}
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className={selectClass}
        >
          <option value="">{`${t("filters.class")}: ${tCommon("all")}`}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-card px-3 py-2 shadow-card">
          <span className="me-2 text-[13px] font-medium">
            {tCommon("selected", { count: selected.length })}
          </span>
          <select
            aria-label={t("bulk.chooseClass")}
            value={bulkClass}
            onChange={(e) => setBulkClass(e.target.value)}
            className={selectClass}
          >
            <option value="">{t("bulk.chooseClass")}</option>
            {classes
              .filter((c) => !c.archivedAt)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <Button
            size="sm"
            tone="secondary"
            disabled={pending || !bulkClass}
            onClick={bulk.addToClass}
          >
            {t("bulk.addToClass")}
          </Button>
          <Button
            size="sm"
            tone="secondary"
            disabled={pending || !bulkClass}
            onClick={bulk.removeFromClass}
          >
            {t("bulk.removeFromClass")}
          </Button>
          <span className="mx-1 h-5 w-px bg-line" />
          <Button size="sm" tone="ghost" disabled={pending} onClick={bulk.passive}>
            {t("bulk.makePassive")}
          </Button>
          <Button size="sm" tone="ghost" disabled={pending} onClick={bulk.active}>
            {t("bulk.makeActive")}
          </Button>
          {canManage ? (
            <Button
              size="sm"
              tone="ghost"
              disabled={pending}
              onClick={bulk.remove}
              className="hover:text-danger"
            >
              {t("bulk.remove")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[640px] text-start text-[13px]">
          <thead className="border-b border-line text-[12px] text-muted">
            <tr>
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label={tCommon("all")}
                  checked={allSelected}
                  onChange={(event) =>
                    setSelected(event.target.checked ? selectable.map((p) => p.userId) : [])
                  }
                />
              </th>
              <th className="px-2 py-2.5 text-start font-medium">{t("columns.name")}</th>
              {showRoles ? (
                <th className="px-2 py-2.5 text-start font-medium">{t("columns.role")}</th>
              ) : null}
              <th className="px-2 py-2.5 text-start font-medium">{t("columns.status")}</th>
              <th className="px-2 py-2.5 text-start font-medium">{t("columns.classes")}</th>
              <th className="px-4 py-2.5 text-end font-medium">{t("columns.joined")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {people.length === 0 && !canManage ? t("emptyInstructor") : t("empty")}
                </td>
              </tr>
            ) : (
              visible.map((p) => {
                const self = p.userId === me;
                return (
                  <tr key={p.userId} className={cn(selected.includes(p.userId) && "bg-subtle")}>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={p.name}
                        disabled={self}
                        checked={selected.includes(p.userId)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, p.userId]
                              : current.filter((id) => id !== p.userId),
                          )
                        }
                      />
                    </td>
                    <td className="max-w-64 px-2 py-2.5">
                      <span className="block truncate font-medium">
                        {p.name}
                        {self ? (
                          <span className="ms-2 text-[11px] font-normal text-muted">
                            {t("you")}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate font-mono text-[11.5px] text-faint">
                        {p.email}
                      </span>
                    </td>
                    {showRoles ? (
                      <td className="px-2 py-2.5">
                        {!self && assignable.length > 1 && assignable.includes(p.role) ? (
                          <select
                            aria-label={`${t("changeRole")}: ${p.name}`}
                            value={p.role}
                            disabled={pending}
                            onChange={(event) =>
                              run(() =>
                                setMemberRoleAction(p.userId, event.target.value as MemberRole),
                              )
                            }
                            className="rounded-chip border border-transparent bg-transparent px-1.5 py-1 text-[13px] hover:border-line"
                          >
                            {assignable.map((r) => (
                              <option key={r} value={r}>
                                {tRoles(r)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="px-1.5">{tRoles(p.role)}</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-2 py-2.5">
                      <span
                        className={cn(
                          "rounded-chip border px-2 py-0.5 text-[11.5px]",
                          p.status === "active"
                            ? "border-line bg-subtle text-muted"
                            : "border-warning-line bg-warning-soft text-warning",
                        )}
                      >
                        {tStatus(p.status)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      {p.classIds.length === 0 ? (
                        <span className="text-faint">{t("noClass")}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {p.classIds.map((id) => {
                            const cls = classById.get(id);
                            if (!cls) return null;
                            return (
                              <span
                                key={id}
                                className="inline-flex items-center gap-1.5 rounded-chip border border-line px-2 py-0.5 text-[12px]"
                              >
                                <ClassDot id={id} color={cls.color} className="size-2" />
                                {cls.name}
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-end whitespace-nowrap text-muted tabular-nums">
                      {format.dateTime(p.joinedAt, { dateStyle: "medium" })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title={t("addTitle")}>
        <AddPersonForm
          classes={classes.filter((c) => !c.archivedAt)}
          assignable={assignable}
          showRoles={showRoles}
          onCancel={() => setAdding(false)}
          onAdded={(name, emailSent) => {
            setAdding(false);
            setNotice(
              emailSent
                ? { tone: "success", text: t("added", { name }) }
                : { tone: "warning", text: t("addedNoEmail", { name }) },
            );
            router.refresh();
          }}
        />
      </Dialog>
    </div>
  );
}

function AddPersonForm({
  classes,
  assignable,
  showRoles,
  onCancel,
  onAdded,
}: {
  classes: ClassOverview[];
  assignable: MemberRole[];
  showRoles: boolean;
  onCancel: () => void;
  onAdded: (name: string, emailSent: boolean) => void;
}) {
  const t = useTranslations("People");
  const tRoles = useTranslations("Roles");
  const tCommon = useTranslations("Common");
  const describe = useActionError("person");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [classIds, setClassIds] = useState<string[]>([]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    start(async () => {
      const result = await addPersonAction({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        role: (form.get("role") as MemberRole | null) ?? "student",
        classIds,
        sendWelcome: form.get("welcome") === "on",
      });
      if (result.ok) onAdded(result.name, result.emailSent);
      else setError(describe(result.error));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{t("name")}</span>
        <input name="name" required autoFocus autoComplete="off" className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{t("email")}</span>
        <input name="email" type="email" required autoComplete="off" className={fieldClass} />
      </label>
      {showRoles && assignable.length > 1 ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">{t("role")}</span>
          <select name="role" defaultValue="student" className={fieldClass}>
            {assignable.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {classes.length > 0 ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[13px] font-medium">{t("classes")}</legend>
          <p className="mb-1 text-[12px] text-muted">{t("classesHint")}</p>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded-chip border border-line px-2.5 py-1.5 text-[13px] has-[:checked]:border-body has-[:checked]:bg-subtle"
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={classIds.includes(c.id)}
                  onChange={(event) =>
                    setClassIds((current) =>
                      event.target.checked
                        ? [...current, c.id]
                        : current.filter((id) => id !== c.id),
                    )
                  }
                />
                <ClassDot id={c.id} color={c.color} className="size-2" />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="welcome" defaultChecked />
        {t("sendWelcome")}
      </label>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div className="flex justify-end gap-2">
        <Button tone="ghost" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : t("addSubmit")}
        </Button>
      </div>
    </form>
  );
}
