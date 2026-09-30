"use server";

import { getAuthenticatorName } from "@better-auth/passkey";
import { listLinkedAccounts, unlinkProvider } from "@zaydemy/auth";
import { updateOwnProfile } from "@zaydemy/core";
import { isLocale } from "@zaydemy/i18n";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { requireSession } from "@/lib/server/session";

/*
 * Settings, as server actions over Better Auth's server API. The matching
 * HTTP endpoints are closed (packages/auth/src/http-allowlist.ts), so these
 * are the only way in, and each acts on the signed-in user only.
 */

export type ActionResult = { ok: true } | { ok: false };

export interface PasskeyRow {
  id: string;
  /** The user's name for it, else the authenticator model, else null. */
  name: string | null;
  createdAt: string;
  backedUp: boolean;
}

/** Tokens stay on the server: a leaked page must not carry other devices' sessions. */
export interface SessionRow {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export async function updateProfile(
  form: FormData,
): Promise<{ ok: true } | { ok: false; reason: "invalid-name" }> {
  const session = await requireSession();
  const locale = String(form.get("locale") ?? "");
  const result = await updateOwnProfile(getDb(), session.user.id, {
    name: String(form.get("name") ?? ""),
    // "" means automatic: follow the organization and the browser.
    locale: isLocale(locale) ? locale : null,
  });
  if (result.status === "invalid-name") return { ok: false, reason: "invalid-name" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function listMyPasskeys(): Promise<PasskeyRow[]> {
  await requireSession();
  const rows = await getAuth().api.listPasskeys({ headers: await headers() });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name?.trim() || (row.aaguid ? getAuthenticatorName(row.aaguid) : null) || null,
      createdAt: new Date(row.createdAt).toISOString(),
      backedUp: Boolean(row.backedUp),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function renamePasskey(id: string, name: string): Promise<ActionResult> {
  await requireSession();
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false };
  try {
    // Better Auth checks that the passkey belongs to the session's user.
    await getAuth().api.updatePasskey({ headers: await headers(), body: { id, name: clean } });
  } catch {
    return { ok: false };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function deletePasskey(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await getAuth().api.deletePasskey({ headers: await headers(), body: { id } });
  } catch {
    return { ok: false };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function getGithubLink() {
  const session = await requireSession();
  const accounts = await listLinkedAccounts(getDb(), session.user.id);
  const github = accounts.find((account) => account.providerId === "github");
  return github ? { accountId: github.accountId, linkedAt: github.linkedAt.toISOString() } : null;
}

export async function unlinkGithub(): Promise<ActionResult> {
  const session = await requireSession();
  await unlinkProvider(getDb(), session.user.id, "github");
  revalidatePath("/settings");
  return { ok: true };
}

async function fetchSessions() {
  return getAuth().api.listSessions({ headers: await headers() });
}

/**
 * Open sessions, current first. Better Auth lists sessions only while the
 * current one is fresh (signed in within the last day): seeing and ending
 * sessions is not something a borrowed, old session should do. `null` means
 * "not fresh"; the page explains how to see them.
 */
export async function listMySessions(): Promise<SessionRow[] | null> {
  const session = await requireSession();
  let rows: Awaited<ReturnType<typeof fetchSessions>>;
  try {
    rows = await fetchSessions();
  } catch {
    return null;
  }
  return rows
    .map((row) => ({
      id: row.id,
      createdAt: new Date(row.createdAt).toISOString(),
      // Without a proxy header the address can be the unspecified "::".
      ipAddress: row.ipAddress && !/^[0:]+$/.test(row.ipAddress) ? row.ipAddress : null,
      userAgent: row.userAgent ?? null,
      current: row.token === session.session.token,
    }))
    .sort((a, b) =>
      a.current !== b.current ? (a.current ? -1 : 1) : b.createdAt.localeCompare(a.createdAt),
    );
}

export async function revokeSession(id: string): Promise<ActionResult> {
  const session = await requireSession();
  // The current session ends with "sign out", not from this list.
  if (id === session.session.id) return { ok: false };
  try {
    // Only the user's own sessions are listed, so an unknown id finds nothing.
    const target = (await fetchSessions()).find((row) => row.id === id);
    if (!target) return { ok: false };
    await getAuth().api.revokeSession({ headers: await headers(), body: { token: target.token } });
  } catch {
    return { ok: false };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function revokeOtherSessions(): Promise<ActionResult> {
  await requireSession();
  try {
    await getAuth().api.revokeOtherSessions({ headers: await headers() });
  } catch {
    return { ok: false };
  }
  revalidatePath("/settings");
  return { ok: true };
}
