import type { EmailConfig } from "@zaydemy/config";
import { createConsoleTransport } from "./console";
import { createResendTransport } from "./resend";
import { createSmtpTransport } from "./smtp";
import type { EmailTransport } from "./types";

export function createEmailTransport(config: EmailConfig): EmailTransport {
  switch (config.transport) {
    case "smtp":
      return createSmtpTransport(config);
    case "resend":
      return createResendTransport(config);
    case "console":
      return createConsoleTransport();
  }
}

export { createConsoleTransport, createResendTransport, createSmtpTransport };
export { EmailDeliveryError, type EmailMessage, type EmailTransport } from "./types";
