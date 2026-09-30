import type { BotProtectionConfig } from "@zaydemy/config";

export interface BotCheckResult {
  ok: boolean;
  /** The check could not run (disabled, or the provider was unreachable). */
  skipped: boolean;
  /** Provider error codes, for logs; never shown to users. */
  codes?: string[];
}

export interface BotProtection {
  readonly provider: BotProtectionConfig["provider"];
  /** What the browser widget needs, or `null` when there is no widget. */
  readonly client: { provider: "turnstile" | "hcaptcha"; siteKey: string } | null;
  verify(token: string | null | undefined, remoteIp?: string | null): Promise<BotCheckResult>;
}

const verifyEndpoints = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
} as const;

// A slow provider must not hang the form it protects.
const timeoutMs = 5000;

/**
 * Bot protection for public forms (sign-in, applications).
 *
 * Fails open only when the check cannot run: the provider is unreachable or
 * answers garbage. This reduces unwanted traffic; it is not an authorization
 * boundary, and an outage at the provider must not lock everyone out of
 * sign-in. A missing or invalid token is always rejected.
 *
 * Both providers answer HTTP 200 for failed checks: the verdict is the body's
 * `success` field, never the status code.
 */
export function createBotProtection(
  config: BotProtectionConfig,
  options: { fetch?: typeof fetch; log?: (message: string, detail?: unknown) => void } = {},
): BotProtection {
  if (config.provider === "none") {
    return {
      provider: "none",
      client: null,
      async verify() {
        return { ok: true, skipped: true };
      },
    };
  }

  const fetchImpl = options.fetch ?? fetch;
  const log = options.log ?? ((message, detail) => console.error(message, detail ?? ""));
  const endpoint = verifyEndpoints[config.provider];
  const skipped = (reason: string, detail?: unknown): BotCheckResult => {
    log(`[bot-protection] ${config.provider}: ${reason}; check skipped`, detail);
    return { ok: true, skipped: true };
  };

  return {
    provider: config.provider,
    client: { provider: config.provider, siteKey: config.siteKey },

    async verify(token, remoteIp) {
      const response = token?.trim();
      if (!response) return { ok: false, skipped: false, codes: ["missing-input-response"] };

      const body = new URLSearchParams({ secret: config.secretKey, response });
      if (remoteIp) body.set("remoteip", remoteIp);

      let reply: Response;
      try {
        reply = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return skipped("provider unreachable", error);
      }
      if (!reply.ok) return skipped(`unexpected status ${reply.status}`);

      const verdict = (await reply.json().catch(() => null)) as {
        success?: unknown;
        "error-codes"?: string[];
      } | null;
      if (!verdict || typeof verdict.success !== "boolean") return skipped("unreadable response");

      return { ok: verdict.success, skipped: false, codes: verdict["error-codes"] };
    },
  };
}
