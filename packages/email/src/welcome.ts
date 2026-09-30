import { getDirection, type Locale } from "@zaydemy/i18n";
import { escapeHtml, layout, styles } from "./layout";
import type { RenderedEmail } from "./sign-in-code";
import { getTranslations } from "./translator";

/** Sent when someone is added to an organization. */
export async function renderWelcomeEmail(input: {
  locale: Locale;
  appName: string;
  organization: string;
  /** Who added them, as shown to the recipient. */
  inviter: string;
  name: string;
  role: string;
  /** False when the address already had an account (in another organization). */
  newAccount: boolean;
  signInUrl: string;
}): Promise<RenderedEmail> {
  const t = await getTranslations({ locale: input.locale, namespace: "Email.welcome" });
  const dir = getDirection(input.locale);
  const values = {
    appName: input.appName,
    organization: input.organization,
    inviter: input.inviter,
  };

  const lines = {
    heading: t("heading", values),
    greeting: t("greeting", { name: input.name }),
    intro: input.newAccount ? t("newAccount", values) : t("existingAccount", values),
    role: t("role", { role: input.role }),
    howToSignIn: t("howToSignIn"),
    signIn: t("signIn"),
    fallback: t("fallbackLink", { url: input.signInUrl }),
  };

  const p = (text: string) =>
    `<p style="margin:0 0 16px;font:400 15px/1.6 ${styles.font};color:#52525b">${escapeHtml(text)}</p>`;
  const bodyHtml = [
    `<h1 style="margin:0 0 12px;font:600 22px/1.3 ${styles.font}">${escapeHtml(lines.heading)}</h1>`,
    p(lines.greeting),
    p(lines.intro),
    p(lines.role),
    p(lines.howToSignIn),
    `<p style="margin:24px 0"><a href="${escapeHtml(input.signInUrl)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#171717;color:#ffffff;font:500 15px/1 ${styles.font};text-decoration:none">${escapeHtml(lines.signIn)}</a></p>`,
    `<p style="margin:0;font:400 13px/1.6 ${styles.font};color:#a1a1aa">${escapeHtml(lines.fallback)}</p>`,
  ].join("\n");

  return {
    subject: t("subject", values),
    html: layout({ lang: input.locale, dir, appName: input.appName, bodyHtml }),
    text: [
      lines.heading,
      "",
      lines.greeting,
      lines.intro,
      lines.role,
      "",
      lines.howToSignIn,
      "",
      `${lines.signIn}: ${input.signInUrl}`,
    ].join("\n"),
  };
}
