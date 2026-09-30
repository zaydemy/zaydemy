"use client";

import { ArrowLeft, ArrowRight, Fingerprint, Mail, RotateCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { BotWidget, type BotWidgetConfig } from "@/components/auth/bot-widget";
import { GithubMark } from "@/components/icons/github-mark";
import { OtpField, type OtpStatus } from "@/components/auth/otp-field";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import {
  closePasskeyOffer,
  isCancelled,
  shouldOfferPasskey,
  suggestedDeviceName,
  supportsPasskeys,
} from "@/lib/passkey-offer";
import { requestCode, verifyCode } from "./actions";

const resendSeconds = 60;

type Step =
  | { name: "email" }
  | { name: "code"; email: string }
  | { name: "passkey-offer" }
  | { name: "blocked"; email: string; reason: "unknown-account" | "blocked" };

export function LoginFlow({
  bot,
  initialEmail,
  initialError,
  codeMinutes,
  githubEnabled,
}: {
  /** Bot-protection widget, when configured. */
  bot: BotWidgetConfig | null;
  initialEmail: string;
  /** A translated message from a failed GitHub round trip (`?error=`). */
  initialError: string | null;
  codeMinutes: number;
  githubEnabled: boolean;
}) {
  const [step, setStep] = useState<Step>({ name: "email" });

  if (step.name === "code") {
    return (
      <CodeStep
        email={step.email}
        bot={bot}
        codeMinutes={codeMinutes}
        onBack={() => setStep({ name: "email" })}
        onOffer={() => setStep({ name: "passkey-offer" })}
      />
    );
  }
  if (step.name === "passkey-offer") return <PasskeyOfferStep />;
  if (step.name === "blocked") {
    return (
      <BlockedStep
        email={step.email}
        reason={step.reason}
        onBack={() => setStep({ name: "email" })}
      />
    );
  }
  return (
    <EmailStep
      bot={bot}
      initialEmail={initialEmail}
      initialError={initialError}
      githubEnabled={githubEnabled}
      onDone={setStep}
    />
  );
}

/** Enter the app after signing in; a full navigation refreshes server state. */
function useEnterApp() {
  const router = useRouter();
  return useCallback(() => {
    router.replace("/");
    router.refresh();
  }, [router]);
}

const noSubscription = () => () => {};

/** Hydration-safe: false while server rendering, the real answer in the browser. */
function usePasskeySupport() {
  return useSyncExternalStore(noSubscription, supportsPasskeys, () => false);
}

/** Keeps the latest single-use bot token and a way to demand a fresh one. */
function useBotToken() {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const onToken = useCallback((value: string | null) => setToken(value), []);
  const spend = useCallback(() => {
    setToken(null);
    setResetKey((key) => key + 1);
  }, []);
  return { token, resetKey, onToken, spend };
}

function EmailStep({
  bot,
  initialEmail,
  initialError,
  githubEnabled,
  onDone,
}: {
  bot: BotWidgetConfig | null;
  initialEmail: string;
  initialError: string | null;
  githubEnabled: boolean;
  onDone: (step: Step) => void;
}) {
  const t = useTranslations("SignIn");
  const enterApp = useEnterApp();
  const passkeys = usePasskeySupport();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(initialError);
  const [alternative, setAlternative] = useState<"passkey" | "github" | null>(null);

  async function signInWithPasskey() {
    setError(null);
    setAlternative("passkey");
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        const code = "code" in result.error ? String(result.error.code).toUpperCase() : "";
        setError(code === "BANNED_USER" ? t("githubErrors.blocked") : t("passkeyErrors.notFound"));
        return;
      }
      enterApp();
    } catch (failure) {
      if (!isCancelled(failure)) setError(t("passkeyErrors.failed"));
    } finally {
      setAlternative(null);
    }
  }

  // Leaves for GitHub and comes back to /login: with a session the page
  // sends the user in, otherwise `?error=` explains what went wrong.
  async function signInWithGithub() {
    setError(null);
    setAlternative("github");
    const { error: failure } = await authClient.signIn.social({
      provider: "github",
      callbackURL: "/",
      errorCallbackURL: "/login",
    });
    if (failure) {
      setAlternative(null);
      setError(t("githubErrors.redirectFailed"));
    }
  }
  const [pending, start] = useTransition();
  const botToken = useBotToken();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await requestCode(email, botToken.token);
      // Tokens are single-use, whatever the outcome.
      botToken.spend();
      switch (result.status) {
        case "sent":
          return onDone({ name: "code", email: result.email });
        case "unknown-account":
        case "blocked":
          return onDone({ name: "blocked", email, reason: result.status });
        case "invalid-email":
          return setError(t("errors.invalidEmail"));
        case "bot-check-failed":
          return setError(t("errors.botCheckFailed"));
        case "rate-limited":
          return setError(t("errors.rateLimited"));
        case "delivery-failed":
          return setError(t("errors.deliveryFailed"));
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <StepTitle title={t("email.title")} text={t("email.description")} />

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-[13px] font-medium text-body">
          {t("email.label")}
        </label>
        <div
          className={cn(
            "flex h-12 items-center gap-2.5 rounded-field border bg-subtle px-3.5 transition-[border-color,box-shadow,background-color] duration-200 focus-within:bg-card",
            error
              ? "border-danger focus-within:shadow-[0_0_0_4px_var(--color-danger-soft)]"
              : "border-line focus-within:border-body focus-within:shadow-[0_0_0_4px_var(--color-subtle-2)]",
          )}
        >
          <Mail size={17} strokeWidth={1.75} className="flex-none text-faint" />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email webauthn"
            inputMode="email"
            placeholder={t("email.placeholder")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "email-error" : undefined}
            className="w-full flex-1 bg-transparent text-[15px] text-body outline-none placeholder:text-faint"
          />
        </div>
        {error ? <ErrorLine id="email-error">{error}</ErrorLine> : null}
      </div>

      {bot ? (
        <BotWidget config={bot} onToken={botToken.onToken} resetKey={botToken.resetKey} />
      ) : null}

      <Button
        size="lg"
        type="submit"
        disabled={pending || (bot !== null && !botToken.token)}
        className="group w-full"
      >
        {pending ? t("email.sending") : t("email.submit")}
        {pending ? null : (
          <ArrowRight
            size={16}
            strokeWidth={2}
            className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
          />
        )}
      </Button>

      {passkeys || githubEnabled ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 text-[12px] text-muted">
            <span className="h-px flex-1 bg-line" />
            {t("alternatives.or")}
            <span className="h-px flex-1 bg-line" />
          </div>
          <div className={cn("grid gap-2.5", passkeys && githubEnabled && "sm:grid-cols-2")}>
            {passkeys ? (
              <AltButton
                icon={<Fingerprint size={17} strokeWidth={1.75} />}
                disabled={pending || alternative !== null}
                onClick={() => void signInWithPasskey()}
              >
                {alternative === "passkey"
                  ? t("alternatives.passkeyWaiting")
                  : t("alternatives.passkey")}
              </AltButton>
            ) : null}
            {githubEnabled ? (
              <AltButton
                icon={<GithubMark size={16} />}
                disabled={pending || alternative !== null}
                onClick={() => void signInWithGithub()}
              >
                {alternative === "github"
                  ? t("alternatives.githubRedirecting")
                  : t("alternatives.github")}
              </AltButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}

function AltButton({
  icon,
  children,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-card border border-line bg-card text-[14px] font-medium text-body transition-colors hover:border-outline hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-body disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * After a code sign-in, once per device: offer to save a passkey. The session
 * exists now, and registering one requires it. Either answer is remembered on
 * this device; Settings can save one any time.
 */
function PasskeyOfferStep() {
  const t = useTranslations("SignIn.passkeyOffer");
  const tSettings = useTranslations("Settings.passkeys");
  const enterApp = useEnterApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function skip() {
    closePasskeyOffer("skipped");
    enterApp();
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const { error: failure } = await authClient.passkey.addPasskey({
        name: suggestedDeviceName(tSettings("unnamed")),
      });
      if (failure) {
        setError(t("failed"));
        return;
      }
      closePasskeyOffer("saved");
      enterApp();
    } catch (failure) {
      if (!isCancelled(failure)) setError(t("failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <span className="flex size-12 items-center justify-center rounded-field border border-line bg-subtle text-body">
        <Fingerprint size={24} strokeWidth={1.5} />
      </span>
      <StepTitle title={t("title")} text={t("body")} />
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <div className="flex flex-col gap-2.5">
        <Button size="lg" disabled={saving} onClick={() => void save()} className="w-full">
          {saving ? t("saving") : t("save")}
        </Button>
        <Button tone="ghost" size="lg" disabled={saving} onClick={skip} className="w-full">
          {t("skip")}
        </Button>
      </div>
      <p className="text-center text-[12px] leading-relaxed text-muted">{t("note")}</p>
    </div>
  );
}

function CodeStep({
  email,
  bot,
  codeMinutes,
  onBack,
  onOffer,
}: {
  email: string;
  bot: BotWidgetConfig | null;
  codeMinutes: number;
  onBack: () => void;
  /** Called instead of entering the app when a passkey should be offered. */
  onOffer: () => void;
}) {
  const t = useTranslations("SignIn");
  const enterApp = useEnterApp();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<OtpStatus>("idle");
  const [errorKey, setErrorKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(resendSeconds);
  const [pending, start] = useTransition();
  const botToken = useBotToken();

  useEffect(() => {
    if (seconds <= 0) return;
    const id = window.setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearInterval(id);
  }, [seconds]);

  const fail = useCallback((message: string) => {
    setStatus("error");
    setErrorKey((key) => key + 1);
    setError(message);
    setCode("");
  }, []);

  const submit = useCallback(
    (value: string) => {
      setError(null);
      setStatus("pending");
      start(async () => {
        const result = await verifyCode(email, value);
        switch (result.status) {
          case "signed-in":
            setStatus("success");
            // Let the confirmation read, then enter.
            await new Promise((resolve) => window.setTimeout(resolve, 450));
            if (shouldOfferPasskey()) onOffer();
            else enterApp();
            return;
          case "invalid":
            return fail(t("errors.invalidCode", { attemptsLeft: result.attemptsLeft }));
          case "expired":
            return fail(t("errors.expired"));
          case "locked":
            fail(t("errors.locked"));
            window.setTimeout(onBack, 2500);
            return;
          case "blocked":
            return fail(t("blocked.blockedBody"));
        }
      });
    },
    [email, enterApp, fail, onBack, onOffer, t],
  );

  function resend() {
    setError(null);
    setStatus("idle");
    setCode("");
    start(async () => {
      const result = await requestCode(email, botToken.token);
      botToken.spend();
      if (result.status === "sent") setSeconds(resendSeconds);
      else if (result.status === "rate-limited") setError(t("errors.rateLimited"));
      else if (result.status === "delivery-failed") setError(t("errors.deliveryFailed"));
      else setError(t("errors.unexpected"));
    });
  }

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-6">
      <BackLink onClick={onBack}>{t("code.back")}</BackLink>
      <StepTitle title={t("code.title")} text={t("code.description", { minutes: codeMinutes })} />
      <EmailChip email={email} />

      <div className="flex flex-col gap-3">
        <OtpField
          value={code}
          onChange={(value) => {
            setCode(value);
            if (status === "error") {
              setStatus("idle");
              setError(null);
            }
          }}
          onComplete={submit}
          status={status}
          errorKey={errorKey}
          disabled={pending || status === "success"}
          label={t("code.fieldLabel")}
        />
        {error ? <ErrorLine>{error}</ErrorLine> : null}
      </div>

      <div className="flex min-h-5 items-center justify-between gap-3 text-[13px]">
        {seconds > 0 ? (
          <span className="text-muted tabular-nums">{t("code.resendIn", { time })}</span>
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={pending || (bot !== null && !botToken.token)}
            className="flex items-center gap-1.5 rounded-chip font-medium text-body underline decoration-outline underline-offset-4 hover:decoration-body disabled:opacity-50"
          >
            <RotateCw size={14} strokeWidth={2} />
            {t("code.resend")}
          </button>
        )}
        <span className="text-muted">{t("code.checkSpam")}</span>
      </div>

      {/* Resending is a new request and needs a fresh token, so the challenge
          appears only once the countdown ends. */}
      {seconds <= 0 && bot ? (
        <BotWidget config={bot} onToken={botToken.onToken} resetKey={botToken.resetKey} />
      ) : null}

      <Button
        size="lg"
        className="w-full"
        disabled={pending || status === "success" || code.length < 6}
        onClick={() => submit(code)}
      >
        {status === "success"
          ? t("code.signingIn")
          : pending
            ? t("code.verifying")
            : t("code.submit")}
      </Button>
    </div>
  );
}

function BlockedStep({
  email,
  reason,
  onBack,
}: {
  email: string;
  reason: "unknown-account" | "blocked";
  onBack: () => void;
}) {
  const t = useTranslations("SignIn");
  const unknown = reason === "unknown-account";
  return (
    <div className="flex flex-col gap-6">
      <BackLink onClick={onBack}>{t("code.back")}</BackLink>
      <span className="flex size-12 items-center justify-center rounded-field border border-warning-line bg-warning-soft text-warning">
        <TriangleAlert size={22} strokeWidth={1.75} />
      </span>
      <StepTitle
        title={unknown ? t("blocked.unknownTitle") : t("blocked.blockedTitle")}
        text={unknown ? t("blocked.unknownBody") : t("blocked.blockedBody")}
      />
      <EmailChip email={email} />
      <Button tone="secondary" size="lg" className="w-full" onClick={onBack}>
        {t("blocked.tryAnother")}
      </Button>
    </div>
  );
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-balance text-body sm:text-[26px]">
        {title}
      </h1>
      <p className="text-[14px] leading-relaxed text-pretty text-muted">{text}</p>
    </div>
  );
}

function ErrorLine({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-[13px] leading-snug text-danger">
      <TriangleAlert size={15} strokeWidth={1.75} className="mt-px flex-none" />
      {children}
    </p>
  );
}

function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ms-1 flex items-center gap-1.5 self-start rounded-chip px-1 py-0.5 text-[13px] text-muted transition-colors hover:text-body focus-visible:outline-2 focus-visible:outline-body"
    >
      <ArrowLeft size={15} strokeWidth={1.75} className="rtl:rotate-180" />
      {children}
    </button>
  );
}

/** a.lovelace@example.com → a.***@example.com */
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local[0]}.***@${domain}`;
}

function EmailChip({ email }: { email: string }) {
  return (
    <span className="-mt-2 inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-subtle px-2.5 py-1 font-mono text-[12.5px] text-body">
      <Mail size={13} strokeWidth={1.75} className="text-faint" />
      {maskEmail(email)}
    </span>
  );
}
