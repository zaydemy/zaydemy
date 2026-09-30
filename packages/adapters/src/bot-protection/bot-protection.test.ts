import { describe, expect, it } from "vitest";
import { createBotProtection } from ".";

const config = { provider: "turnstile" as const, siteKey: "site", secretKey: "secret" };
const quiet = () => {};

function withReply(reply: () => Response | Promise<Response>) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetchStub = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams });
    return reply();
  }) as typeof fetch;
  return { calls, protection: createBotProtection(config, { fetch: fetchStub, log: quiet }) };
}

describe("bot protection", () => {
  it("passes everything when disabled and exposes no widget", async () => {
    const protection = createBotProtection({ provider: "none" });
    expect(protection.client).toBeNull();
    expect(await protection.verify(undefined)).toEqual({ ok: true, skipped: true });
  });

  it("rejects a missing token without calling the provider", async () => {
    const { calls, protection } = withReply(() => Response.json({ success: true }));
    expect(await protection.verify("  ")).toMatchObject({ ok: false, skipped: false });
    expect(calls).toHaveLength(0);
  });

  it("sends secret, token and IP, and trusts only the body's verdict", async () => {
    const { calls, protection } = withReply(() =>
      Response.json({ success: false, "error-codes": ["invalid-input-response"] }),
    );
    expect(await protection.verify("token", "203.0.113.7")).toEqual({
      ok: false,
      skipped: false,
      codes: ["invalid-input-response"],
    });
    expect(calls[0]?.url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(calls[0]!.body)).toEqual({
      secret: "secret",
      response: "token",
      remoteip: "203.0.113.7",
    });
  });

  it("accepts a successful check", async () => {
    const { protection } = withReply(() => Response.json({ success: true }));
    expect(await protection.verify("token")).toMatchObject({ ok: true, skipped: false });
  });

  it("fails open only when the provider cannot answer", async () => {
    for (const reply of [
      () => Promise.reject(new TypeError("fetch failed")),
      () => new Response("down", { status: 503 }),
      () => new Response("<html>", { status: 200 }),
      () => Response.json({ unexpected: true }),
    ]) {
      const { protection } = withReply(reply);
      expect(await protection.verify("token")).toEqual({ ok: true, skipped: true });
    }
  });

  it("uses the hCaptcha endpoint for hCaptcha", async () => {
    const calls: string[] = [];
    const protection = createBotProtection(
      { ...config, provider: "hcaptcha" },
      {
        fetch: (async (url: string) => {
          calls.push(url);
          return Response.json({ success: true });
        }) as typeof fetch,
      },
    );
    await protection.verify("token");
    expect(calls).toEqual(["https://api.hcaptcha.com/siteverify"]);
    expect(protection.client).toEqual({ provider: "hcaptcha", siteKey: "site" });
  });
});
