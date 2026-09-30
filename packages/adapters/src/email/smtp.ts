import { createTransport } from "nodemailer";
import type { EmailConfig } from "@zaydemy/config";
import { EmailDeliveryError, type EmailMessage, type EmailTransport } from "./types";

type SmtpConfig = Extract<EmailConfig, { transport: "smtp" }>;

/** Any SMTP server: a mail provider, Amazon SES's SMTP interface, or a local relay. */
export function createSmtpTransport(config: SmtpConfig): EmailTransport {
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    // `secure` means implicit TLS (port 465); otherwise STARTTLS is used when offered.
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
  });

  return {
    name: "smtp",
    async send(message: EmailMessage) {
      try {
        const info = await transporter.sendMail({ from: config.from, ...message });
        if (info.rejected.length > 0) {
          throw new EmailDeliveryError(`SMTP server rejected ${message.to}`, "smtp");
        }
      } catch (error) {
        if (error instanceof EmailDeliveryError) throw error;
        throw new EmailDeliveryError(`SMTP delivery failed: ${String(error)}`, "smtp", {
          cause: error,
        });
      }
    },
  };
}
