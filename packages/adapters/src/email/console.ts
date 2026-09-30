import type { EmailMessage, EmailTransport } from "./types";

/**
 * Development transport: prints messages to the server log instead of sending
 * them, so signing in locally needs no mail account and never spends a
 * provider's quota. The block layout keeps a sign-in code easy to spot.
 */
export function createConsoleTransport(
  log: (text: string) => void = (text) => console.info(text),
): EmailTransport {
  return {
    name: "console",
    async send(message: EmailMessage) {
      const line = "─".repeat(64);
      log(
        [
          "",
          line,
          "  EMAIL (not sent: console transport)",
          `  To      : ${message.to}`,
          `  Subject : ${message.subject}`,
          line,
          ...message.text.split("\n").map((row) => `  ${row}`),
          line,
          "",
        ].join("\n"),
      );
    },
  };
}
