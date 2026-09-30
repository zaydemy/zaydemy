"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { classColor } from "@/components/class-dot";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/section";
import { useActionError } from "@/lib/use-action-error";
import type { ActionResult } from "../organization-actions";

const kinds = ["class", "individual"] as const;

export const fieldClass =
  "h-11 w-full rounded-field border border-line bg-subtle px-3.5 text-[14px] text-body outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-body focus:bg-card focus:shadow-[0_0_0_4px_var(--color-subtle-2)]";

/** Create or edit a class: name, (on create) type, colour. */
export function ClassForm({
  initial,
  withKind,
  onSubmit,
  onDone,
}: {
  initial?: { id: string; name: string; color: string | null };
  withKind: boolean;
  onSubmit: (values: {
    name: string;
    kind: "class" | "individual";
    color: string | null;
  }) => Promise<ActionResult>;
  onDone: () => void;
}) {
  const t = useTranslations("Classes");
  const tCommon = useTranslations("Common");
  const describe = useActionError();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [autoColor, setAutoColor] = useState(!initial?.color);
  const [color, setColor] = useState(initial?.color ?? classColor(initial?.id ?? "new", null));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    start(async () => {
      const result = await onSubmit({
        name: String(form.get("name") ?? ""),
        kind: form.get("kind") === "individual" ? "individual" : "class",
        color: autoColor ? null : color,
      });
      if (result.ok) onDone();
      else setError(describe(result.error));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{t("name")}</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={initial?.name}
          placeholder={t("namePlaceholder")}
          autoFocus
          className={fieldClass}
        />
      </label>

      {withKind ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium">{t("kind")}</legend>
          {kinds.map((kind) => (
            <label
              key={kind}
              className="flex cursor-pointer items-start gap-3 rounded-card border border-line px-3.5 py-2.5 has-[:checked]:border-body has-[:checked]:bg-subtle"
            >
              <input
                type="radio"
                name="kind"
                value={kind}
                defaultChecked={kind === "class"}
                className="mt-1"
              />
              <span className="flex flex-col">
                <span className="text-[14px] font-medium">{t(`kinds.${kind}`)}</span>
                <span className="text-[12.5px] text-muted">{t(`kinds.${kind}Hint`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">{t("color")}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input
              type="checkbox"
              checked={autoColor}
              onChange={(event) => setAutoColor(event.target.checked)}
            />
            {t("colorAuto")}
          </label>
          {autoColor ? null : (
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              aria-label={t("color")}
              className="h-9 w-14 cursor-pointer rounded-chip border border-line bg-card p-1"
            />
          )}
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div className="flex justify-end gap-2">
        <Button tone="ghost" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? tCommon("saving") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
