"use client";

import { ArrowRight, ChevronDown, CircleCheck, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { setUp, type SetupState } from "./actions";

const presets = ["individual", "academy", "school"] as const;
const languages = ["en", "tr"] as const;

const fieldClass =
  "h-12 w-full rounded-field border border-line bg-subtle px-3.5 text-[15px] text-body outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-faint focus:border-body focus:bg-card focus:shadow-[0_0_0_4px_var(--color-subtle-2)]";

export function SetupForm({ appName }: { appName: string }) {
  const t = useTranslations("Setup");
  const tLanguage = useTranslations("Language");
  const locale = useLocale();
  const [state, action, pending] = useActionState<SetupState, FormData>(setUp, { status: "idle" });

  if (state.status === "done") {
    return (
      <div className="flex flex-col gap-6">
        <span className="flex size-12 items-center justify-center rounded-field border border-success-line bg-success-soft text-success">
          <CircleCheck size={22} strokeWidth={1.75} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-body">
            {t("doneTitle")}
          </h1>
          <p className="text-[14px] leading-relaxed text-muted">
            {t("doneBody", { email: state.email })}
          </p>
        </div>
        <Link
          href={`/login?email=${encodeURIComponent(state.email)}`}
          className="inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-card bg-primary text-[15px] font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          {t("continue")}
          <ArrowRight size={16} strokeWidth={2} className="rtl:rotate-180" />
        </Link>
      </div>
    );
  }

  const error =
    state.status === "error"
      ? {
          required: t("errors.required"),
          "invalid-email": t("errors.invalidEmail"),
          "already-set-up": t("errors.alreadySetUp"),
        }[state.reason]
      : null;

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-balance text-body sm:text-[26px]">
          {t("title", { appName })}
        </h1>
        <p className="text-[14px] leading-relaxed text-pretty text-muted">{t("description")}</p>
      </div>

      <Field label={t("name")} htmlFor="name">
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          placeholder={t("namePlaceholder")}
          className={fieldClass}
        />
      </Field>
      <Field label={t("email")} htmlFor="email" hint={t("emailHint")}>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={fieldClass}
        />
      </Field>
      <Field label={t("organization")} htmlFor="organization">
        <input
          id="organization"
          name="organization"
          required
          autoComplete="organization"
          placeholder={t("organizationPlaceholder")}
          className={fieldClass}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium text-body">{t("preset")}</legend>
        {presets.map((preset) => (
          <label
            key={preset}
            className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-card px-3.5 py-3 transition-colors hover:border-outline has-[:checked]:border-body has-[:checked]:bg-subtle"
          >
            <input
              type="radio"
              name="preset"
              value={preset}
              defaultChecked={preset === "academy"}
              className="mt-1 accent-[var(--color-primary)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] font-medium text-body">{t(`presets.${preset}`)}</span>
              <span className="text-[13px] text-muted">{t(`presets.${preset}Hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field label={t("language")} htmlFor="locale">
        <div className="relative">
          <select
            id="locale"
            name="locale"
            defaultValue={locale}
            className={cn(fieldClass, "appearance-none pe-10")}
          >
            {languages.map((language) => (
              <option key={language} value={language}>
                {tLanguage(language)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            size={16}
            strokeWidth={1.75}
            className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-faint"
          />
        </div>
      </Field>

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-[13px] leading-snug text-danger">
          <TriangleAlert size={15} strokeWidth={1.75} className="mt-px flex-none" />
          {error}
        </p>
      ) : null}

      <Button size="lg" type="submit" disabled={pending} className="w-full">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-body">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}
