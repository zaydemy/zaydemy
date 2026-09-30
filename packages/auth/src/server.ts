import { passkey } from "@better-auth/passkey";
import type { ServerConfig } from "@zaydemy/config";
import { schema, type Database } from "@zaydemy/db";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, emailOTP, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { isPublicAuthPath } from "./http-allowlist";

export const signInCode = {
  length: 6,
  expiresInSeconds: 10 * 60,
  allowedAttempts: 3,
} as const;

export interface AuthDependencies {
  db: Database;
  config: Pick<ServerConfig, "appName" | "appUrl" | "appSecret" | "github">;
  /** Framework integrations, e.g. `nextCookies()` from the web app. */
  plugins?: BetterAuthPlugin[];
}

/** WebAuthn relying party. The ID is bound to the host and cannot change later. */
export function passkeyRelyingParty(config: Pick<ServerConfig, "appName" | "appUrl">) {
  const url = new URL(config.appUrl);
  return { rpID: url.hostname, rpName: config.appName, origin: url.origin };
}

/**
 * Better Auth for zaydemy. Framework-free: the web app adds `nextCookies()`.
 *
 * - Passwordless: sign-in codes by email, passkeys, and later GitHub.
 * - Closed registration: accounts come from setup and invitations only.
 * - Sessions last 30 days and refresh daily.
 */
export function createAuth({ db, config, plugins = [] }: AuthDependencies) {
  return betterAuth({
    appName: config.appName,
    baseURL: config.appUrl,
    secret: config.appSecret,
    trustedOrigins: [config.appUrl],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
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
      },
    }),
    advanced: {
      // Postgres generates uuid keys (gen_random_uuid defaults).
      database: { generateId: "uuid" },
    },
    emailAndPassword: { enabled: false },
    socialProviders: config.github
      ? {
          github: {
            clientId: config.github.clientId,
            clientSecret: config.github.clientSecret,
            // Read-only profile access (Better Auth adds `user:email` to read a
            // private primary address). Never `repo`: that would be write
            // access to every private repository.
            scope: ["read:user"],
            // A GitHub account never creates a zaydemy account: it signs in
            // only once its owner linked it from settings.
            disableSignUp: true,
          },
        }
      : {},
    user: {
      // Exposed on the session so the UI can pick locale and time zone.
      additionalFields: {
        locale: { type: "string", required: false, input: false },
        timeZone: { type: "string", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    account: {
      accountLinking: {
        enabled: true,
        // Linking only happens from a signed-in user's own request. Implicit
        // linking at sign-in would let any provider account whose email
        // matches (verified by the provider or not) take over an account.
        disableImplicitLinking: true,
        allowDifferentEmails: true,
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.request && !isPublicAuthPath(ctx.path)) throw new APIError("NOT_FOUND");
      }),
    },
    databaseHooks: {
      session: {
        create: {
          // Sessions are born here whatever the sign-in path (code, passkey,
          // GitHub). The admin plugin checks bans too, but only when called
          // with a request context; this check has no such gap.
          // Impersonation is exempt: a platform admin may look at a banned
          // account.
          before: async (session) => {
            if ((session as { impersonatedBy?: string | null }).impersonatedBy) return;
            const [row] = await db
              .select({ banned: schema.user.banned, banExpires: schema.user.banExpires })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
              .limit(1);
            const expired = row?.banExpires && row.banExpires.getTime() < Date.now();
            if (row?.banned && !expired) {
              throw new APIError("FORBIDDEN", {
                code: "BANNED_USER",
                message: "Account is blocked.",
              });
            }
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: signInCode.length,
        expiresIn: signInCode.expiresInSeconds,
        allowedAttempts: signInCode.allowedAttempts,
        disableSignUp: true,
        // Only a hash of the code is stored.
        storeOTP: "hashed",
        // Codes are created with `createVerificationOTP` and sent by
        // `requestSignInCode`, which reports delivery failures. Better Auth
        // swallows errors thrown here, so nothing should reach this path.
        async sendVerificationOTP({ type }) {
          console.error(
            `[auth] unexpected OTP send path (${type}); codes are sent by requestSignInCode`,
          );
        },
      }),
      passkey({
        ...passkeyRelyingParty(config),
        authenticatorSelection: {
          // The device's own lock (Face ID, fingerprint, PIN) verifies the user.
          userVerification: "preferred",
          authenticatorAttachment: "platform",
          residentKey: "preferred",
        },
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        // Platform role lives in `user.platform_role`, apart from tenant roles.
        schema: { user: { fields: { role: "platformRole" } } },
      }),
      organization({
        allowUserToCreateOrganization: false,
        teams: { enabled: true, defaultTeam: { enabled: false } },
      }),
      ...plugins,
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
