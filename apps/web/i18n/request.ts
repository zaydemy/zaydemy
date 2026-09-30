import { loadMessages, localeCookieName, resolveLocale } from "@zaydemy/i18n";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  // The user's saved preference and the organization default join these
  // sources once accounts and tenants exist.
  const locale = resolveLocale({
    cookie: cookieStore.get(localeCookieName)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });

  return {
    locale,
    messages: await loadMessages(locale),
    // Replaced by the user's (or organization's) time zone with the tenant
    // model. A fixed zone keeps server and client rendering identical.
    timeZone: "UTC",
  };
});
