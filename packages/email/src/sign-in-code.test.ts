import { describe, expect, it } from "vitest";
import { renderSignInCodeEmail } from "./sign-in-code";

const base = { appName: "Kodlama <Akademisi>", code: "482913", expiresInMinutes: 10 };

describe("sign-in code email", () => {
  it("renders in English with subject, HTML and plain text", async () => {
    const email = await renderSignInCodeEmail({ ...base, locale: "en", name: "Ayşe" });
    expect(email.subject).toBe("482913 is your sign-in code for Kodlama <Akademisi>");
    expect(email.html).toContain('<html lang="en" dir="ltr">');
    expect(email.html).toContain("482913");
    expect(email.text).toContain("Hi Ayşe,");
    expect(email.text).toContain("Sign-in code: 482913");
    expect(email.text).toContain("expires in 10 minutes");
  });

  it("renders in the recipient's language", async () => {
    const email = await renderSignInCodeEmail({ ...base, locale: "tr", name: "Ayşe" });
    expect(email.subject).toBe("Kodlama <Akademisi> giriş kodun: 482913");
    expect(email.html).toContain('lang="tr"');
    expect(email.text).toContain("Merhaba Ayşe,");
    expect(email.text).toContain("Kod 10 dakika geçerli.");
  });

  it("escapes names and brand text in HTML", async () => {
    const email = await renderSignInCodeEmail({
      ...base,
      locale: "en",
      name: "<script>x</script>",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Kodlama &lt;Akademisi&gt;");
  });

  it("omits the greeting when the name is unknown", async () => {
    const email = await renderSignInCodeEmail({ ...base, locale: "en" });
    expect(email.text).not.toContain("Hi");
  });
});
