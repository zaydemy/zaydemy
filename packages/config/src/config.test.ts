import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";

const base = { DATABASE_URL: "postgres://localhost/zaydemy" };

const production = {
  ...base,
  NODE_ENV: "production",
  APP_URL: "https://learn.example.com/",
  APP_SECRET: "x".repeat(32),
  EMAIL_TRANSPORT: "smtp",
  EMAIL_FROM: "School <no-reply@example.com>",
  SMTP_HOST: "smtp.example.com",
};

function issuesOf(env: Record<string, string>): string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }
  throw new Error("Expected the configuration to be rejected.");
}

describe("loadConfig", () => {
  it("starts in development with only a database", () => {
    const config = loadConfig(base);
    expect(config.environment).toBe("development");
    expect(config.appUrl).toBe("http://localhost:3010");
    expect(config.email.transport).toBe("console");
    expect(config.storage).toMatchObject({
      driver: "local",
      publicUrl: "http://localhost:3010/api/files",
    });
    expect(config.botProtection).toEqual({ provider: "none" });
  });

  it("treats empty variables as unset", () => {
    expect(loadConfig({ ...base, EMAIL_TRANSPORT: "", APP_URL: "" }).email.transport).toBe(
      "console",
    );
  });

  it("accepts a complete production configuration and trims the URL", () => {
    const config = loadConfig(production);
    expect(config.appUrl).toBe("https://learn.example.com");
    expect(config.email).toMatchObject({ transport: "smtp", port: 587, secure: false });
  });

  it("refuses production without URL, secret or an explicit email transport", () => {
    const issues = issuesOf({ ...base, NODE_ENV: "production" });
    expect(issues.join("\n")).toMatch(/APP_URL/);
    expect(issues.join("\n")).toMatch(/APP_SECRET/);
    expect(issues.join("\n")).toMatch(/EMAIL_TRANSPORT/);
  });

  it("allows the console transport in production only when chosen explicitly", () => {
    expect(
      loadConfig({ ...production, EMAIL_TRANSPORT: "console", SMTP_HOST: "" }).email.transport,
    ).toBe("console");
  });

  it("requires each transport's own settings", () => {
    expect(issuesOf({ ...base, EMAIL_TRANSPORT: "resend" }).join("\n")).toMatch(
      /EMAIL_FROM[\s\S]*RESEND_API_KEY/,
    );
    expect(
      issuesOf({
        ...base,
        EMAIL_TRANSPORT: "smtp",
        EMAIL_FROM: "a@b.c",
        SMTP_HOST: "h",
        SMTP_USER: "u",
      }),
    ).toEqual(["SMTP_USER / SMTP_PASSWORD: set both or neither"]);
  });

  it("requires bucket settings for S3 storage and keys for bot protection", () => {
    const issues = issuesOf({ ...base, STORAGE_DRIVER: "s3", BOT_PROTECTION: "turnstile" });
    for (const name of [
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_PUBLIC_URL",
      "BOT_PROTECTION_SITE_KEY",
      "BOT_PROTECTION_SECRET_KEY",
    ]) {
      expect(issues.some((issue) => issue.startsWith(name))).toBe(true);
    }
  });

  it("reports malformed values by variable name", () => {
    const issues = issuesOf({
      ...base,
      APP_URL: "not a url",
      APP_SECRET: "short",
      SMTP_PORT: "70000",
      EMAIL_TRANSPORT: "carrier-pigeon",
    });
    expect(issues.map((issue) => issue.split(":")[0]).sort()).toEqual([
      "APP_SECRET",
      "APP_URL",
      "EMAIL_TRANSPORT",
      "SMTP_PORT",
    ]);
  });

  it("requires a database", () => {
    expect(issuesOf({}).some((issue) => issue.startsWith("DATABASE_URL"))).toBe(true);
  });
});
