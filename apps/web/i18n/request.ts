import { loadMessages, localeCookieName, resolveLocale } from "@zaydemy/i18n";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { getSession, listMemberships } from "@/lib/server/session";

export default getRequestConfig(async () => {
  const [cookieStore, headerStore, session] = await Promise.all([
    cookies(),
    headers(),
    getSession(),
  ]);

  let organizationLocale: string | null | undefined;
  if (session) {
    const memberships = await listMemberships(session.user.id);
    const active =
      memberships.find((m) => m.organizationId === session.session.activeOrganizationId) ??
      memberships[0];
    organizationLocale = active?.defaultLocale;
  }

  const locale = resolveLocale({
    user: session?.user.locale,
    cookie: cookieStore.get(localeCookieName)?.value,
    organization: organizationLocale,
    acceptLanguage: headerStore.get("accept-language"),
  });

  return {
    locale,
    messages: await loadMessages(locale),
    // The user's (or organization's) time zone arrives with profile settings.
    // A fixed zone keeps server and client rendering identical.
    timeZone: session?.user.timeZone ?? "UTC",
  };
});
