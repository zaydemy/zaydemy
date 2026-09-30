import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConsoleTransport } from "./console";
import { createResendTransport } from "./resend";
import { createSmtpTransport } from "./smtp";
import { EmailDeliveryError } from "./types";

const message = {
  to: "student@example.com",
  subject: "Your sign-in code",
  html: "<p>123456</p>",
  text: "Code: 123456",
};

describe("console transport", () => {
  it("prints recipient, subject and text instead of sending", async () => {
    const lines: string[] = [];
    await createConsoleTransport((text) => lines.push(text)).send(message);
    expect(lines.join("\n")).toMatch(/student@example\.com[\s\S]*Your sign-in code[\s\S]*123456/);
  });
});

describe("smtp transport", () => {
  const received: { from?: string; to: string[]; data: string }[] = [];
  let server: SMTPServer;
  let port: number;

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS"],
      logger: false,
      onRcptTo(address, _session, callback) {
        if (address.address.endsWith("@blocked.example")) {
          return callback(new Error("mailbox unavailable"));
        }
        callback();
      },
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : undefined,
            to: session.envelope.rcptTo.map((r) => r.address),
            data: Buffer.concat(chunks).toString(),
          });
          callback();
        });
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server.server, "listening");
    port = (server.server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const transport = () =>
    createSmtpTransport({
      transport: "smtp",
      from: "School <no-reply@example.com>",
      host: "127.0.0.1",
      port,
      secure: false,
    });

  it("delivers the message with both HTML and text parts", async () => {
    await transport().send(message);
    const mail = received.at(-1)!;
    expect(mail.from).toBe("no-reply@example.com");
    expect(mail.to).toEqual(["student@example.com"]);
    expect(mail.data).toMatch(/Subject: Your sign-in code/);
    expect(mail.data).toMatch(/text\/plain[\s\S]*Code: 123456/);
    expect(mail.data).toMatch(/text\/html[\s\S]*<p>123456<\/p>/);
  });

  it("throws when the server refuses the recipient", async () => {
    await expect(
      transport().send({ ...message, to: "someone@blocked.example" }),
    ).rejects.toBeInstanceOf(EmailDeliveryError);
  });

  it("throws when the server is unreachable", async () => {
    const unreachable = createSmtpTransport({
      transport: "smtp",
      from: "a@b.c",
      host: "127.0.0.1",
      port: 1,
      secure: false,
    });
    await expect(unreachable.send(message)).rejects.toBeInstanceOf(EmailDeliveryError);
  });
});

describe("resend transport", () => {
  const config = {
    transport: "resend" as const,
    from: "School <a@example.com>",
    apiKey: "re_test",
  };

  it("posts the message with the API key", async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const fetchStub = (async (url: string, init: RequestInit) => {
      request = { url, init };
      return Response.json({ id: "email_1" });
    }) as typeof fetch;

    await createResendTransport(config, fetchStub).send(message);

    expect(request?.url).toBe("https://api.resend.com/emails");
    expect(new Headers(request?.init.headers).get("authorization")).toBe("Bearer re_test");
    expect(JSON.parse(String(request?.init.body))).toEqual({ from: config.from, ...message });
  });

  it("turns an error response into an exception, with a hint for unverified senders", async () => {
    const fetchStub = (async () =>
      Response.json({ message: "The domain is not verified" }, { status: 403 })) as typeof fetch;

    await expect(createResendTransport(config, fetchStub).send(message)).rejects.toThrow(
      /not verified[\s\S]*verified in Resend/,
    );
  });

  it("turns a network failure into an exception", async () => {
    const fetchStub = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(createResendTransport(config, fetchStub).send(message)).rejects.toBeInstanceOf(
      EmailDeliveryError,
    );
  });
});
