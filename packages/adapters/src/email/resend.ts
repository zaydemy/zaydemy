import type { EmailConfig } from "@zaydemy/config";
import { EmailDeliveryError, type EmailMessage, type EmailTransport } from "./types";

type ResendConfig = Extract<EmailConfig, { transport: "resend" }>;

const endpoint = "https://api.resend.com/emails";
const timeoutMs = 10_000;

/**
 * Resend's HTTP API, called directly (no SDK). Failures are reported in the
 * response body, so a non-2xx status must be turned into an error here:
 * otherwise a failed sign-in code would look sent.
 */
export function createResendTransport(
  config: ResendConfig,
  fetchImpl: typeof fetch = fetch,
): EmailTransport {
  return {
    name: "resend",
    async send(message: EmailMessage) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ from: config.from, ...message }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new EmailDeliveryError(`Resend unreachable: ${String(error)}`, "resend", {
          cause: error,
        });
      }

      if (response.ok) return;

      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      const reason = body?.message ?? `HTTP ${response.status}`;
      // An unverified sender domain only delivers to the account owner, which
      // shows up as "works for me, not for students".
      const hint =
        response.status === 403 || /domain|verif/i.test(reason)
          ? ` (is the sender ${config.from} verified in Resend?)`
          : "";
      throw new EmailDeliveryError(`Resend rejected the message: ${reason}${hint}`, "resend");
    },
  };
}
