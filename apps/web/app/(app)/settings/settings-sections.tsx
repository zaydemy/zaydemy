"use client";

import { Cloud, Fingerprint, KeyRound, LogOut, Monitor, Smartphone } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { GithubMark } from "@/components/icons/github-mark";
import { Button } from "@/components/ui/button";
import { ErrorNote, Section } from "@/components/ui/section";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import {
  closePasskeyOffer,
  isCancelled,
  suggestedDeviceName,
  supportsPasskeys,
} from "@/lib/passkey-offer";
import {
  deletePasskey,
  renamePasskey,
  revokeOtherSessions,
  revokeSession,
  unlinkGithub,
  updateProfile,
  type PasskeyRow,
  type SessionRow,
} from "./actions";

const fieldClass =
  "h-11 w-full rounded-field border border-line bg-subtle px-3.5 text-[14px] text-body outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-body focus:bg-card focus:shadow-[0_0_0_4px_var(--color-subtle-2)]";

const noSubscription = () => () => {};

export function ProfileSection({
  name,
  email,
  locale,
}: {
  name: string;
  email: string;
  /** Saved preference; null means automatic. */
  locale: string | null;
}) {
  const t = useTranslations("Settings.profile");
  const tLanguage = useTranslations("Language");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<"saved" | "invalid-name" | null>(null);

  return (
    <Section title={t("title")}>
      <form
        className="flex flex-col gap-4 p-4"
        action={(form) =>
          start(async () => {
            const result = await updateProfile(form);
            setMessage(result.ok ? "saved" : result.reason);
            if (result.ok) router.refresh();
          })
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">{t("name")}</span>
            <input
              name="name"
              defaultValue={name}
              required
              autoComplete="name"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">{t("language")}</span>
            <select name="locale" defaultValue={locale ?? ""} className={fieldClass}>
              <option value="">{t("languageAuto")}</option>
              <option value="en">{tLanguage("en")}</option>
              <option value="tr">{tLanguage("tr")}</option>
            </select>
          </label>
        </div>
        <p className="text-[13px] text-muted">
          {t("email")}: <span className="font-mono text-[12.5px] text-body">{email}</span>
        </p>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
          {message === "saved" ? (
            <span className="text-[13px] text-success">{t("saved")}</span>
          ) : null}
          {message === "invalid-name" ? <ErrorNote>{t("invalidName")}</ErrorNote> : null}
        </div>
      </form>
    </Section>
  );
}

export function AppearanceSection() {
  const t = useTranslations("Settings.appearance");
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser.
  const mounted = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const options = ["system", "light", "dark"] as const;

  return (
    <Section title={t("title")}>
      <div role="radiogroup" aria-label={t("theme")} className="flex gap-2 p-4">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mounted && theme === option}
            onClick={() => setTheme(option)}
            className="h-9 rounded-[10px] border border-line px-3.5 text-[13px] text-muted transition-colors hover:bg-subtle hover:text-body aria-checked:border-body aria-checked:bg-subtle aria-checked:font-medium aria-checked:text-body"
          >
            {t(option)}
          </button>
        ))}
      </div>
    </Section>
  );
}

export function PasskeysSection({ passkeys }: { passkeys: PasskeyRow[] }) {
  const t = useTranslations("Settings.passkeys");
  const format = useFormatter();
  const router = useRouter();
  const supported = useSyncExternalStore(noSubscription, supportsPasskeys, () => true);
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = pending || saving;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const { error: failure } = await authClient.passkey.addPasskey({
        name: suggestedDeviceName(t("unnamed")),
      });
      if (failure) {
        const code = "code" in failure ? String(failure.code) : "";
        setError(
          code.includes("ALREADY") || code.includes("EXCLUDED")
            ? t("errors.exists")
            : t("errors.failed"),
        );
        return;
      }
      // No need to offer it again after sign-in on this device.
      closePasskeyOffer("saved");
      router.refresh();
    } catch (failure) {
      if (!isCancelled(failure)) setError(t("errors.failed"));
    } finally {
      setSaving(false);
    }
  }

  function rename(row: PasskeyRow) {
    const name = window.prompt(t("renamePrompt"), row.name ?? "");
    if (name === null) return;
    setError(null);
    start(async () => {
      const result = await renamePasskey(row.id, name);
      if (result.ok) router.refresh();
      else setError(t("errors.renameFailed"));
    });
  }

  function remove(row: PasskeyRow) {
    if (!window.confirm(t("removeConfirm", { name: row.name ?? t("unnamed") }))) return;
    setError(null);
    start(async () => {
      const result = await deletePasskey(row.id);
      if (result.ok) router.refresh();
      else setError(t("errors.removeFailed"));
    });
  }

  return (
    <Section
      title={t("title")}
      meta={passkeys.length > 0 ? t("count", { count: passkeys.length }) : null}
    >
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13.5px] leading-relaxed text-muted">{t("body")}</p>

        {passkeys.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {passkeys.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-subtle px-4 py-3"
              >
                <Fingerprint size={17} strokeWidth={1.75} className="flex-none" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{row.name ?? t("unnamed")}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-faint">
                    {t("added", {
                      date: format.dateTime(new Date(row.createdAt), { dateStyle: "medium" }),
                    })}
                    {row.backedUp ? (
                      <>
                        <span aria-hidden>·</span>
                        <Cloud size={11} strokeWidth={2} />
                        {t("backedUp")}
                      </>
                    ) : null}
                  </p>
                </div>
                <Button tone="ghost" size="sm" disabled={busy} onClick={() => rename(row)}>
                  {t("rename")}
                </Button>
                <Button
                  tone="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(row)}
                  className="hover:text-danger"
                >
                  {t("remove")}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {supported ? (
          <Button disabled={busy} onClick={() => void save()} className="self-start">
            <KeyRound size={16} strokeWidth={2} />
            {saving ? t("saving") : passkeys.length > 0 ? t("addAnother") : t("add")}
          </Button>
        ) : (
          <p className="text-[13px] text-muted">{t("unsupported")}</p>
        )}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <p className="text-[12px] leading-relaxed text-faint">{t("privacy")}</p>
      </div>
    </Section>
  );
}

export function GithubSection({
  enabled,
  link,
}: {
  enabled: boolean;
  link: { accountId: string; linkedAt: string } | null;
}) {
  const t = useTranslations("Settings.github");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    setRedirecting(true);
    const { error: failure } = await authClient.linkSocial({
      provider: "github",
      callbackURL: "/settings",
    });
    if (failure) {
      setRedirecting(false);
      setError(t("linkFailed"));
    }
  }

  function disconnect() {
    if (!window.confirm(t("unlinkConfirm"))) return;
    start(async () => {
      await unlinkGithub();
      router.refresh();
    });
  }

  return (
    <Section title={t("title")} meta={link ? t("linked") : null}>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[13.5px] leading-relaxed text-muted">
          {enabled ? t("body") : t("notConfigured")}
        </p>
        {link ? (
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-subtle px-4 py-3">
            <GithubMark size={16} className="flex-none" />
            <p className="min-w-0 flex-1 text-[13px]">
              {t("accountLabel", { id: link.accountId })}
              <span className="ms-2 text-[11.5px] text-faint">
                {format.dateTime(new Date(link.linkedAt), { dateStyle: "medium" })}
              </span>
            </p>
            <Button
              tone="ghost"
              size="sm"
              disabled={pending}
              onClick={disconnect}
              className="hover:text-danger"
            >
              {t("unlink")}
            </Button>
          </div>
        ) : enabled ? (
          <Button disabled={redirecting} onClick={() => void connect()} className="self-start">
            <GithubMark size={15} />
            {redirecting ? t("redirecting") : t("link")}
          </Button>
        ) : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Section>
  );
}

/** A readable device from a user agent. Not exact, but enough to tell sessions apart. */
function deviceOf(userAgent: string | null): { label: string | null; mobile: boolean } {
  if (!userAgent) return { label: null, mobile: false };
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : null;
  const platform = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  const label = [browser, platform].filter(Boolean).join(" · ") || null;
  return { label, mobile: /iPhone|iPad|Android/.test(userAgent) };
}

export function SessionsSection({ sessions }: { sessions: SessionRow[] | null }) {
  const t = useTranslations("Settings.sessions");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const others = sessions?.filter((row) => !row.current).length ?? 0;

  function run(action: () => Promise<{ ok: boolean }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(t("failed"));
    });
  }

  return (
    <Section
      title={t("title")}
      meta={sessions && sessions.length > 0 ? t("count", { count: sessions.length }) : null}
      action={
        others > 0 ? (
          <Button
            tone="secondary"
            size="sm"
            disabled={pending}
            onClick={() => window.confirm(t("signOutOthersConfirm")) && run(revokeOtherSessions)}
          >
            {t("signOutOthers")}
          </Button>
        ) : null
      }
    >
      {error ? (
        <div className="border-b border-danger-line bg-danger-soft px-4 py-2.5">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
      {sessions === null ? (
        <p className="px-4 py-5 text-[13px] leading-relaxed text-muted">{t("stale")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((row) => {
            const device = deviceOf(row.userAgent);
            const Icon = device.mobile ? Smartphone : Monitor;
            const label = device.label ?? t("unknownDevice");
            return (
              <li
                key={row.id}
                className={cn("flex items-center gap-3 px-4 py-3", row.current && "bg-subtle")}
              >
                <span className="flex size-9 flex-none items-center justify-center rounded-chip border border-line bg-card text-muted">
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                    {label}
                    {row.current ? (
                      <span className="rounded-chip border border-success-line bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                        {t("current")}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11.5px] text-faint">
                    {t("details", {
                      ip: row.ipAddress ?? t("unknownIp"),
                      date: format.dateTime(new Date(row.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </p>
                </div>
                {row.current ? null : (
                  <button
                    type="button"
                    title={t("revoke")}
                    aria-label={t("revokeLabel", { device: label })}
                    disabled={pending}
                    onClick={() =>
                      window.confirm(t("revokeConfirm", { device: label })) &&
                      run(() => revokeSession(row.id))
                    }
                    className="flex size-8 flex-none items-center justify-center rounded-chip text-faint transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-35"
                  >
                    <LogOut size={14} strokeWidth={1.75} className="rtl:rotate-180" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted">
        {t("note")}
      </p>
    </Section>
  );
}
