"use server";

import {
  requestSignInCode,
  verifySignInCode,
  type RequestCodeResult,
  type VerifyCodeResult,
} from "@zaydemy/auth";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getBotProtection, getConfig, getEmailTransport } from "@/lib/server/services";
import { clientIp } from "@/lib/server/session";

// Server actions for the sign-in page. Results are status codes; the page
// turns them into translated messages.

export async function requestCode(
  email: string,
  botToken: string | null,
): Promise<RequestCodeResult> {
  return requestSignInCode(
    {
      auth: getAuth(),
      db: getDb(),
      email: getEmailTransport(),
      botProtection: getBotProtection(),
      appName: getConfig().appName,
    },
    { email, botToken, ip: await clientIp(), requestLocale: await getLocale() },
  );
}

/** On success the session cookie is set (Better Auth's nextCookies plugin). */
export async function verifyCode(
  email: string,
  code: string,
): Promise<Exclude<VerifyCodeResult, { status: "signed-in" }> | { status: "signed-in" }> {
  const result = await verifySignInCode(
    { auth: getAuth(), db: getDb() },
    { email, code, headers: await headers() },
  );
  // Headers are not serializable to the client and not needed there.
  return result.status === "signed-in" ? { status: "signed-in" } : result;
}
