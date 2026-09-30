import { envSchema, type Env } from "./schema";

export type EmailConfig =
  | { transport: "console"; from: string }
  | {
      transport: "smtp";
      from: string;
      host: string;
      port: number;
      secure: boolean;
      user?: string;
      password?: string;
    }
  | { transport: "resend"; from: string; apiKey: string };

export type StorageConfig =
  | { driver: "local"; directory: string; publicUrl: string; signingSecret: string }
  | {
      driver: "s3";
      endpoint?: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicUrl: string;
      forcePathStyle: boolean;
    };

export type BotProtectionConfig =
  { provider: "none" } | { provider: "turnstile" | "hcaptcha"; siteKey: string; secretKey: string };

export interface ServerConfig {
  environment: Env["NODE_ENV"];
  /** Shown in emails, the browser title and passkey prompts. */
  appName: string;
  /** Public base URL without a trailing slash, e.g. `https://learn.example.com`. */
  appUrl: string;
  /** Signs tokens (upload URLs, and sessions once auth lands). */
  appSecret: string;
  databaseUrl: string;
  email: EmailConfig;
  storage: StorageConfig;
  botProtection: BotProtectionConfig;
}

/** Thrown with every problem at once, so an operator fixes them in one pass. */
export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

// Development only: lets `pnpm dev` start without a secret. Rejected in production.
const developmentSecret = "zaydemy-development-secret-do-not-use-in-production";
const developmentUrl = "http://localhost:3010";

/**
 * Validates the environment and assembles the server configuration.
 * Settings that only make sense together (a transport and its credentials)
 * are checked together, and production refuses unsafe development defaults.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }

  const e = parsed.data;
  const production = e.NODE_ENV === "production";
  const issues: string[] = [];
  const need = <T>(name: string, value: T | undefined, why: string): T => {
    if (value === undefined) issues.push(`${name}: required ${why}`);
    return value as T;
  };

  const appUrl = production
    ? need("APP_URL", e.APP_URL, "in production")
    : (e.APP_URL ?? developmentUrl);
  const appSecret = production
    ? need("APP_SECRET", e.APP_SECRET, "in production")
    : (e.APP_SECRET ?? developmentSecret);

  // Sign-in codes go by email: a production instance that silently prints
  // them to its logs would lock everyone out. Console must be chosen on purpose.
  const transport = production
    ? need("EMAIL_TRANSPORT", e.EMAIL_TRANSPORT, "in production (console, smtp or resend)")
    : (e.EMAIL_TRANSPORT ?? "console");

  let email: EmailConfig;
  switch (transport) {
    case "smtp":
      email = {
        transport,
        from: need("EMAIL_FROM", e.EMAIL_FROM, "for EMAIL_TRANSPORT=smtp"),
        host: need("SMTP_HOST", e.SMTP_HOST, "for EMAIL_TRANSPORT=smtp"),
        port: e.SMTP_PORT,
        secure: e.SMTP_SECURE,
        user: e.SMTP_USER,
        password: e.SMTP_PASSWORD,
      };
      if (Boolean(e.SMTP_USER) !== Boolean(e.SMTP_PASSWORD)) {
        issues.push("SMTP_USER / SMTP_PASSWORD: set both or neither");
      }
      break;
    case "resend":
      email = {
        transport,
        from: need("EMAIL_FROM", e.EMAIL_FROM, "for EMAIL_TRANSPORT=resend"),
        apiKey: need("RESEND_API_KEY", e.RESEND_API_KEY, "for EMAIL_TRANSPORT=resend"),
      };
      break;
    default:
      email = { transport: "console", from: e.EMAIL_FROM ?? "zaydemy <no-reply@localhost>" };
  }

  const storage: StorageConfig =
    e.STORAGE_DRIVER === "s3"
      ? {
          driver: "s3",
          endpoint: e.S3_ENDPOINT,
          region: e.S3_REGION,
          bucket: need("S3_BUCKET", e.S3_BUCKET, "for STORAGE_DRIVER=s3"),
          accessKeyId: need("S3_ACCESS_KEY_ID", e.S3_ACCESS_KEY_ID, "for STORAGE_DRIVER=s3"),
          secretAccessKey: need(
            "S3_SECRET_ACCESS_KEY",
            e.S3_SECRET_ACCESS_KEY,
            "for STORAGE_DRIVER=s3",
          ),
          publicUrl: need("S3_PUBLIC_URL", e.S3_PUBLIC_URL, "for STORAGE_DRIVER=s3"),
          forcePathStyle: e.S3_FORCE_PATH_STYLE,
        }
      : {
          driver: "local",
          directory: e.STORAGE_LOCAL_DIR,
          publicUrl: `${appUrl}/api/files`,
          signingSecret: appSecret,
        };

  const botProtection: BotProtectionConfig =
    e.BOT_PROTECTION === "none"
      ? { provider: "none" }
      : {
          provider: e.BOT_PROTECTION,
          siteKey: need(
            "BOT_PROTECTION_SITE_KEY",
            e.BOT_PROTECTION_SITE_KEY,
            `for BOT_PROTECTION=${e.BOT_PROTECTION}`,
          ),
          secretKey: need(
            "BOT_PROTECTION_SECRET_KEY",
            e.BOT_PROTECTION_SECRET_KEY,
            `for BOT_PROTECTION=${e.BOT_PROTECTION}`,
          ),
        };

  if (issues.length > 0) throw new ConfigError(issues);

  return {
    environment: e.NODE_ENV,
    appName: e.APP_NAME,
    appUrl,
    appSecret,
    databaseUrl: e.DATABASE_URL,
    email,
    storage,
    botProtection,
  };
}
