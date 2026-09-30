export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative; required so every message reads without HTML. */
  text: string;
}

export interface EmailTransport {
  readonly name: "console" | "smtp" | "resend";
  /**
   * Sends one message. Throws when the message was not accepted: callers tell
   * users "we sent you a code" only after this resolves.
   */
  send(message: EmailMessage): Promise<void>;
}

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    readonly transport: EmailTransport["name"],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}
