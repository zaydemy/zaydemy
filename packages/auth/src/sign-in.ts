import type { BotProtection, EmailTransport } from "@zaydemy/adapters";
import { isRateLimited, type RateLimitRule } from "@zaydemy/core";
import { schema, type Database } from "@zaydemy/db";
import { renderSignInCodeEmail } from "@zaydemy/email";
import { resolveLocale, type Locale } from "@zaydemy/i18n";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { signInCode, type Auth } from "./server";

/*
 * Email sign-in, as server-side operations the web app calls from server
 * actions. Results are status codes, never user-facing text: the UI turns
 * them into translated messages.
 */

export interface SignInDependencies {
  auth: Auth;
  db: Database;
  email: EmailTransport;
  botProtection: BotProtection;
  appName: string;
}

// Per address: stops mailbox flooding. Per IP: stops address scanning.
export const signInRateLimits = {
  email: { windowMs: 5 * 60_000, max: 3 },
  ip: { windowMs: 15 * 60_000, max: 10 },
} satisfies Record<string, RateLimitRule>;

export type RequestCodeResult =
  | { status: "sent"; email: string }
  | { status: "invalid-email" }
  | { status: "bot-check-failed" }
  | { status: "rate-limited" }
  | { status: "unknown-account" }
  | { status: "blocked" }
  | { status: "delivery-failed" };

export type VerifyCodeResult =
  | { status: "signed-in"; headers: Headers }
  | { status: "invalid"; attemptsLeft: number }
  | { status: "expired" }
  | { status: "locked" }
  | { status: "blocked" };

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function requestSignInCode(
  deps: SignInDependencies,
  input: {
    email: string;
    botToken?: string | null;
    ip?: string | null;
    /** The request's resolved locale; used when the account has no preference. */
    requestLocale: Locale;
  },
): Promise<RequestCodeResult> {
  const email = normalizeEmail(input.email);
  // Format first, so a typo does not spend a bot-protection token.
  if (!emailPattern.test(email)) return { status: "invalid-email" };

  // Bot check before rate limiting: a bot must not be able to fill a real
  // user's rate-limit bucket.
  const bot = await deps.botProtection.verify(input.botToken, input.ip);
  if (!bot.ok) return { status: "bot-check-failed" };

  if (
    (await isRateLimited(deps.db, `sign-in-code:email:${email}`, signInRateLimits.email)) ||
    (await isRateLimited(deps.db, `sign-in-code:ip:${input.ip ?? "unknown"}`, signInRateLimits.ip))
  ) {
    return { status: "rate-limited" };
  }

  const [account] = await deps.db
    .select({
      name: schema.user.name,
      locale: schema.user.locale,
      banned: schema.user.banned,
      banExpires: schema.user.banExpires,
    })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);

  // Registration is closed. Telling people their address is not registered
  // (instead of pretending a code was sent) is a deliberate product choice:
  // students mistype addresses, and the rate limits bound enumeration.
  if (!account) return { status: "unknown-account" };
  if (account.banned && !(account.banExpires && account.banExpires.getTime() < Date.now())) {
    return { status: "blocked" };
  }

  const code = await deps.auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
  const message = await renderSignInCodeEmail({
    locale: resolveLocale({ user: account.locale, acceptLanguage: input.requestLocale }),
    appName: deps.appName,
    name: account.name,
    code,
    expiresInMinutes: signInCode.expiresInSeconds / 60,
  });

  try {
    await deps.email.send({ to: email, ...message });
  } catch (error) {
    console.error("[auth] sign-in code not delivered", email, error);
    return { status: "delivery-failed" };
  }
  return { status: "sent", email };
}

/**
 * Checks a code and creates the session. On success, `headers` carries the
 * session cookie; in Next.js the `nextCookies()` plugin also writes it.
 */
export async function verifySignInCode(
  deps: Pick<SignInDependencies, "auth" | "db">,
  input: { email: string; code: string; headers?: Headers },
): Promise<VerifyCodeResult> {
  const email = normalizeEmail(input.email);
  const code = input.code.replace(/\D/g, "");
  if (code.length !== signInCode.length) {
    return { status: "invalid", attemptsLeft: await attemptsLeft(deps.db, email) };
  }

  try {
    const response = await deps.auth.api.signInEmailOTP({
      body: { email, otp: code },
      headers: input.headers ?? new Headers(),
      returnHeaders: true,
    });
    return { status: "signed-in", headers: response.headers };
  } catch (error) {
    const reason = error instanceof APIError ? (error.body?.code as string | undefined) : undefined;
    switch (reason) {
      case "OTP_EXPIRED":
        return { status: "expired" };
      case "TOO_MANY_ATTEMPTS":
        return { status: "locked" };
      case "BANNED_USER":
        return { status: "blocked" };
      case "INVALID_OTP": {
        const left = await attemptsLeft(deps.db, email);
        return left > 0 ? { status: "invalid", attemptsLeft: left } : { status: "locked" };
      }
      default:
        throw error;
    }
  }
}

/** Remaining attempts for the pending code; 0 when there is none. */
async function attemptsLeft(db: Database, email: string): Promise<number> {
  const [row] = await db
    .select({ value: schema.verification.value })
    .from(schema.verification)
    .where(eq(schema.verification.identifier, `sign-in-otp-${email}`))
    .limit(1);
  if (!row) return 0;
  // Better Auth stores `<code>:<attempts used>`.
  const used = Number.parseInt(row.value.slice(row.value.lastIndexOf(":") + 1), 10) || 0;
  return Math.max(0, signInCode.allowedAttempts - used);
}
