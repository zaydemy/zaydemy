import { loadMessages, type Locale, type Messages } from "@zaydemy/i18n";
import { createTranslator } from "use-intl/core";

type EmailNamespace = `Email.${keyof Messages["Email"] & string}`;

/**
 * Translator for email copy in the recipient's locale. Emails are rendered
 * outside any request, so this uses use-intl's core instead of next-intl.
 *
 * Same name and signature as next-intl's server `getTranslations`, on purpose:
 * `pnpm i18n:check` recognizes this call shape, so email keys are checked for
 * missing, unused and undefined keys like every other key. Keep the namespace
 * a string literal.
 */
export async function getTranslations<N extends EmailNamespace>({
  locale,
  namespace,
}: {
  locale: Locale;
  namespace: N;
}) {
  const messages = await loadMessages(locale);
  return createTranslator({ locale, messages, namespace });
}
