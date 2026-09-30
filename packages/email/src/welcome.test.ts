import { describe, expect, it } from "vitest";
import { renderWelcomeEmail } from "./welcome";

const base = {
  appName: "zaydemy",
  organization: "Kodlama <Akademisi>",
  inviter: "Ayşe Yılmaz",
  name: "Deniz",
  role: "student",
  signInUrl: "https://learn.example.com/login?email=deniz%40example.com",
};

describe("welcome email", () => {
  it("explains a new account, the role and how to sign in", async () => {
    const email = await renderWelcomeEmail({ ...base, locale: "en", newAccount: true });
    expect(email.subject).toBe("You have been added to Kodlama <Akademisi>");
    expect(email.text).toContain("Ayşe Yılmaz created an account for you on zaydemy");
    expect(email.text).toContain("Your role: student.");
    expect(email.text).toContain(`Sign in: ${base.signInUrl}`);
    expect(email.html).toContain("Kodlama &lt;Akademisi&gt;");
    expect(email.html).toContain(
      'href="https://learn.example.com/login?email=deniz%40example.com"',
    );
  });

  it("tells existing accounts they joined another organization, in their language", async () => {
    const email = await renderWelcomeEmail({
      ...base,
      locale: "tr",
      newAccount: false,
      role: "instructor",
    });
    expect(email.subject).toBe("Kodlama <Akademisi> kurumuna eklendin");
    expect(email.text).toContain("kurumların arasında geçiş yapabilirsin");
    expect(email.text).toContain("Rolün: eğitmen.");
  });
});
