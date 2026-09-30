import { z } from "zod";

/*
 * Server configuration, read from environment variables once at startup.
 * Every variable is documented in .env.example; keep the two in sync.
 *
 * Messages here are for whoever installs zaydemy (operators), so they are
 * plain English log output, not translated UI text.
 */

/** Unset and empty are the same thing: `FOO=` in a .env file means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const url = z.url({ protocol: /^https?$/ }).transform((value) => value.replace(/\/+$/, ""));

const port = z.coerce.number().int().min(1).max(65535);

export const envSchema = z.object({
  NODE_ENV: optional(z.enum(["development", "test", "production"])).default("development"),

  APP_NAME: optional(z.string().trim().min(1).max(60)).default("zaydemy"),
  APP_URL: optional(url),
  APP_SECRET: optional(z.string().min(32, "must be at least 32 characters")),

  DATABASE_URL: z.string().min(1),

  EMAIL_TRANSPORT: optional(z.enum(["console", "smtp", "resend"])),
  EMAIL_FROM: optional(z.string().min(3)),
  SMTP_HOST: optional(z.string()),
  SMTP_PORT: optional(port).default(587),
  SMTP_SECURE: optional(bool).default(false),
  SMTP_USER: optional(z.string()),
  SMTP_PASSWORD: optional(z.string()),
  RESEND_API_KEY: optional(z.string()),

  STORAGE_DRIVER: optional(z.enum(["local", "s3"])).default("local"),
  STORAGE_LOCAL_DIR: optional(z.string()).default("./data/uploads"),
  S3_ENDPOINT: optional(url),
  S3_REGION: optional(z.string()).default("auto"),
  S3_BUCKET: optional(z.string()),
  S3_ACCESS_KEY_ID: optional(z.string()),
  S3_SECRET_ACCESS_KEY: optional(z.string()),
  S3_PUBLIC_URL: optional(url),
  S3_FORCE_PATH_STYLE: optional(bool).default(true),

  BOT_PROTECTION: optional(z.enum(["none", "turnstile", "hcaptcha"])).default("none"),
  BOT_PROTECTION_SITE_KEY: optional(z.string()),
  BOT_PROTECTION_SECRET_KEY: optional(z.string()),
});

export type Env = z.infer<typeof envSchema>;
