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
  let organizationTimeZone: string | null | undefined;
  if (session) {
    const memberships = await listMemberships(session.user.id);
    const active =
      memberships.find((m) => m.organizationId === session.session.activeOrganizationId) ??
      memberships[0];
    organizationLocale = active?.defaultLocale;
    organizationTimeZone = active?.timeZone;
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
    // The user's zone, else the organization's. Always explicit, so server
    // and client render the same times.
    timeZone: session?.user.timeZone ?? organizationTimeZone ?? "UTC",
  };
});
