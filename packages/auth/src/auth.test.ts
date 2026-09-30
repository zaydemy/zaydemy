import type { BotProtection, EmailMessage, EmailTransport } from "@zaydemy/adapters";
import { schema } from "@zaydemy/db";
import { createUser, useTestDatabase } from "@zaydemy/db/testing";
import { getSchema } from "better-auth/db";
import { eq, getTableColumns, type Table } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "./server";
import {
  requestSignInCode,
  signInRateLimits,
  verifySignInCode,
  type SignInDependencies,
} from "./sign-in";

const database = useTestDatabase();
const config = {
  appName: "Test Academy",
  appUrl: "http://localhost:3010",
  appSecret: "s".repeat(32),
  github: null,
};

let auth: Auth;
let sent: EmailMessage[];
let deps: SignInDependencies;

const recordingTransport: EmailTransport = {
  name: "console",
  async send(message) {
    sent.push(message);
  },
};
const noBotProtection: BotProtection = {
  provider: "none",
  client: null,
  async verify() {
    return { ok: true, skipped: true };
  },
};

beforeAll(() => {
  auth = createAuth({ db: database.db, config });
  sent = [];
  deps = {
    auth,
    db: database.db,
    email: recordingTransport,
    botProtection: noBotProtection,
    appName: config.appName,
  };
});

/** Distinct IPs per test, so the per-IP limit does not couple tests. */
let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter}`;

async function requestCode(email: string, overrides: Partial<SignInDependencies> = {}) {
  return requestSignInCode({ ...deps, ...overrides }, { email, ip: nextIp(), requestLocale: "en" });
}

function lastCode(): string {
  const match = sent.at(-1)?.text.match(/: (\d{6})/);
  if (!match) throw new Error("No code in the last email.");
  return match[1]!;
}

describe("schema compatibility", () => {
  it("has every table and field Better Auth expects", () => {
    const provided: Record<string, Table> = {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      passkey: schema.passkey,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
      team: schema.team,
      teamMember: schema.teamMember,
    };
    const expected = getSchema(auth.options);
    // Guards against a vacuous pass if Better Auth's schema API changes shape.
    expect(Object.keys(expected).sort()).toEqual(Object.keys(provided).sort());
    expect(Object.keys(expected.user!.fields)).toEqual(
      expect.arrayContaining(["email", "platformRole", "banned"]),
    );

    const missing: string[] = [];
    for (const [model, { fields }] of Object.entries(expected)) {
      const table = provided[model];
      if (!table) {
        missing.push(model);
        continue;
      }
      const columns = getTableColumns(table);
      for (const field of Object.keys(fields)) {
        if (!(field in columns)) missing.push(`${model}.${field}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("HTTP surface", () => {
  const call = (path: string, method = "GET") =>
    auth.handler(
      new Request(`${config.appUrl}/api/auth${path}`, {
        method,
        headers: { "content-type": "application/json", origin: config.appUrl },
        body:
          method === "POST"
            ? JSON.stringify({ email: "a@example.com", type: "sign-in" })
            : undefined,
      }),
    );

  it("hides endpoints that must only be called from server code", async () => {
    for (const [path, method] of [
      ["/email-otp/send-verification-otp", "POST"],
      ["/sign-in/email-otp", "POST"],
      ["/organization/list-members", "GET"],
      ["/admin/list-users", "GET"],
      ["/update-user", "POST"],
      // Management goes through server actions, not the browser.
      ["/list-sessions", "GET"],
      ["/revoke-other-sessions", "POST"],
      ["/list-accounts", "GET"],
      ["/unlink-account", "POST"],
      ["/passkey/list-user-passkeys", "GET"],
      ["/passkey/delete-passkey", "POST"],
    ] as const) {
      expect((await call(path, method)).status, path).toBe(404);
    }
  });

  it("keeps browser-facing endpoints reachable", async () => {
    expect((await call("/get-session")).status).toBe(200);
    // The passkey sign-in ceremony starts without a session.
    expect((await call("/passkey/generate-authenticate-options")).status).toBe(200);
  });
});

describe("GitHub", () => {
  const socialSignIn = (target: Auth) =>
    target.handler(
      new Request(`${config.appUrl}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: config.appUrl },
        body: JSON.stringify({ provider: "github", callbackURL: "/" }),
      }),
    );

  it("is unavailable unless configured", async () => {
    expect((await socialSignIn(auth)).ok).toBe(false);
  });

  it("redirects to GitHub asking only for read access to the profile", async () => {
    const withGithub = createAuth({
      db: database.db,
      config: { ...config, github: { clientId: "gh-client", clientSecret: "gh-secret" } },
    });
    const response = await socialSignIn(withGithub);
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    const target = new URL(url);
    expect(target.origin + target.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(target.searchParams.get("client_id")).toBe("gh-client");
    // Better Auth's defaults (read:user, user:email) plus ours: read-only.
    expect(new Set(target.searchParams.get("scope")?.split(" "))).toEqual(
      new Set(["read:user", "user:email"]),
    );
    expect(target.searchParams.get("redirect_uri")).toBe(
      `${config.appUrl}/api/auth/callback/github`,
    );
  });
});

describe("sign-in with an email code", () => {
  it("sends a code in the account's language and signs in with it", async () => {
    const user = await createUser(database.db, { name: "Ayşe", locale: "tr" });

    expect(await requestCode(`  ${user.email.toUpperCase()} `)).toEqual({
      status: "sent",
      email: user.email,
    });
    const email = sent.at(-1)!;
    expect(email.to).toBe(user.email);
    expect(email.subject).toMatch(/^Test Academy giriş kodun: \d{6}$/);

    const result = await verifySignInCode(deps, { email: user.email, code: lastCode() });
    expect(result.status).toBe("signed-in");
    const cookie = result.status === "signed-in" ? result.headers.get("set-cookie") : null;
    expect(cookie).toMatch(/session_token=/);

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookie!.split(";")[0]! }),
    });
    expect(session?.user.id).toBe(user.id);
    expect(session?.user.locale).toBe("tr");
  });

  it("uses the request's language when the account has none", async () => {
    const user = await createUser(database.db);
    await requestCode(user.email);
    expect(sent.at(-1)!.subject).toMatch(/is your sign-in code for Test Academy$/);
  });

  it("stores only a hash of the code", async () => {
    const user = await createUser(database.db);
    await requestCode(user.email);
    const [row] = await database.db
      .select({ value: schema.verification.value })
      .from(schema.verification)
      .where(eq(schema.verification.identifier, `sign-in-otp-${user.email}`));
    expect(row?.value).not.toContain(lastCode());
  });

  it("counts down attempts, then locks the code", async () => {
    const user = await createUser(database.db);
    await requestCode(user.email);
    const code = lastCode();
    const wrong = code === "000000" ? "111111" : "000000";

    expect(await verifySignInCode(deps, { email: user.email, code: wrong })).toEqual({
      status: "invalid",
      attemptsLeft: 2,
    });
    expect(await verifySignInCode(deps, { email: user.email, code: wrong })).toEqual({
      status: "invalid",
      attemptsLeft: 1,
    });
    expect(await verifySignInCode(deps, { email: user.email, code: wrong })).toEqual({
      status: "locked",
    });
    // Even the right code no longer works.
    expect((await verifySignInCode(deps, { email: user.email, code })).status).not.toBe(
      "signed-in",
    );
  });

  it("rejects expired codes", async () => {
    const user = await createUser(database.db);
    await requestCode(user.email);
    await database.db
      .update(schema.verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.verification.identifier, `sign-in-otp-${user.email}`));
    expect(await verifySignInCode(deps, { email: user.email, code: lastCode() })).toEqual({
      status: "expired",
    });
  });

  it("tells unknown and malformed addresses apart without sending anything", async () => {
    const before = sent.length;
    expect(await requestCode("nobody@example.test")).toEqual({ status: "unknown-account" });
    expect(await requestCode("not-an-email")).toEqual({ status: "invalid-email" });
    expect(sent.length).toBe(before);
  });

  it("blocks banned accounts at request and at verification", async () => {
    const banned = await createUser(database.db, { banned: true });
    expect(await requestCode(banned.email)).toEqual({ status: "blocked" });

    // Banned after the code was sent: the session is still refused.
    const user = await createUser(database.db);
    await requestCode(user.email);
    await database.db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, user.id));
    expect(await verifySignInCode(deps, { email: user.email, code: lastCode() })).toEqual({
      status: "blocked",
    });

    // An expired ban no longer blocks.
    const lapsed = await createUser(database.db, {
      banned: true,
      banExpires: new Date(Date.now() - 1000),
    });
    expect((await requestCode(lapsed.email)).status).toBe("sent");
  });

  it("limits requests per address", async () => {
    const user = await createUser(database.db);
    for (let i = 0; i < 3; i++) expect((await requestCode(user.email)).status).toBe("sent");
    expect(await requestCode(user.email)).toEqual({ status: "rate-limited" });
  });

  it("limits requests per IP across addresses, generously enough for a shared school network", async () => {
    const ip = "203.0.113.50";
    const { max } = signInRateLimits.ip;
    expect(max).toBeGreaterThanOrEqual(60);
    for (let i = 0; i < max; i++) {
      const user = await createUser(database.db);
      const result = await requestSignInCode(deps, { email: user.email, ip, requestLocale: "en" });
      expect(result.status).toBe("sent");
    }
    const one = await createUser(database.db);
    expect(
      (await requestSignInCode(deps, { email: one.email, ip, requestLocale: "en" })).status,
    ).toBe("rate-limited");
  });

  it("checks bots before counting the request", async () => {
    const user = await createUser(database.db);
    const failing: BotProtection = {
      ...noBotProtection,
      async verify() {
        return { ok: false, skipped: false };
      },
    };
    for (let i = 0; i < 5; i++) {
      expect(await requestCode(user.email, { botProtection: failing })).toEqual({
        status: "bot-check-failed",
      });
    }
    // Rejected bot attempts did not use up the real user's quota.
    expect((await requestCode(user.email)).status).toBe("sent");
  });

  it("reports delivery failures instead of claiming the code was sent", async () => {
    const user = await createUser(database.db);
    const broken: EmailTransport = {
      name: "smtp",
      async send() {
        throw new Error("SMTP down");
      },
    };
    expect(await requestCode(user.email, { email: broken })).toEqual({ status: "delivery-failed" });
  });
});
