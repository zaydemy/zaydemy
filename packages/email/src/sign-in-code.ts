import { getDirection, type Locale } from "@zaydemy/i18n";
import { escapeHtml, layout, styles } from "./layout";
import { getTranslations } from "./translator";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export async function renderSignInCodeEmail(input: {
  locale: Locale;
  appName: string;
  /** Recipient's name; the greeting is omitted when unknown. */
  name?: string | null;
  code: string;
  expiresInMinutes: number;
}): Promise<RenderedEmail> {
  const t = await getTranslations({ locale: input.locale, namespace: "Email.signInCode" });
  const dir = getDirection(input.locale);
  const values = { appName: input.appName, code: input.code, minutes: input.expiresInMinutes };

  const greeting = input.name ? t("greeting", { name: input.name }) : null;
  const lines = {
    heading: t("heading"),
    intro: t("intro", values),
    codeLabel: t("codeLabel"),
    expiry: t("expiry", values),
    ignore: t("ignore"),
  };

  const p = (text: string, style: string) =>
    `<p style="margin:0 0 16px;font:400 15px/1.6 ${styles.font};${style}">${escapeHtml(text)}</p>`;
  const bodyHtml = [
    `<h1 style="margin:0 0 12px;font:600 22px/1.3 ${styles.font}">${escapeHtml(lines.heading)}</h1>`,
    greeting ? p(greeting, "color:#52525b") : "",
    p(lines.intro, "color:#52525b"),
    `<div style="margin:24px 0;padding:24px;border:1px solid #e4e4e7;border-radius:12px;background:#fafafa;text-align:center">
      <div style="margin-bottom:12px;font:500 11px/1 ${styles.mono};letter-spacing:.14em;text-transform:uppercase;color:#71717a">${escapeHtml(lines.codeLabel)}</div>
      <div dir="ltr" style="font:700 36px/1 ${styles.mono};letter-spacing:.24em;color:#18181b">${escapeHtml(input.code)}</div>
    </div>`,
    p(lines.expiry, "color:#52525b"),
    `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #e4e4e7;font:400 13px/1.6 ${styles.font};color:#a1a1aa">${escapeHtml(lines.ignore)}</p>`,
  ].join("\n");

  return {
    subject: t("subject", values),
    html: layout({ lang: input.locale, dir, appName: input.appName, bodyHtml }),
    text: [
      lines.heading,
      "",
      greeting,
      lines.intro,
      "",
      `${lines.codeLabel}: ${input.code}`,
      "",
      lines.expiry,
      "",
      lines.ignore,
    ]
      .filter((line) => line !== null)
      .join("\n"),
  };
}
