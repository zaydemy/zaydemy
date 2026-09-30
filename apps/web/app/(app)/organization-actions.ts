"use server";

import {
  addPerson,
  addToClass,
  createClass,
  deleteClass,
  removeFromClass,
  removeMembers,
  setClassArchived,
  setMemberRole,
  setMemberStatus,
  updateClass,
} from "@zaydemy/core";
import type { MemberRole, MemberStatus, TeamKind } from "@zaydemy/db/schema";
import { renderWelcomeEmail } from "@zaydemy/email";
import { resolveLocale } from "@zaydemy/i18n";
import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/server/db";
import { getConfig, getEmailTransport } from "@/lib/server/services";
import { inTenant, requireTenant } from "@/lib/server/tenant";

/*
 * Class and people management. Each action runs in a tenant transaction
 * (row level security) and the core functions check the role table; these
 * wrappers only translate results for the UI and refresh the pages.
 */

export type ActionError =
  | "forbidden"
  | "not-found"
  | "invalid-name"
  | "invalid-color"
  | "invalid-email"
  | "invalid-class"
  | "already-member";

export type ActionResult = { ok: true } | { ok: false; error: ActionError };

function done(result: { status: string }): ActionResult {
  if (result.status === "ok" || result.status === "created") {
    revalidatePath("/classes", "layout");
    revalidatePath("/people");
    revalidatePath("/");
    return { ok: true };
  }
  return { ok: false, error: result.status as ActionError };
}

export async function createClassAction(input: {
  name: string;
  kind: TeamKind;
  color: string | null;
}) {
  return done(await inTenant((tx) => createClass(tx, input)));
}

export async function updateClassAction(id: string, input: { name: string; color: string | null }) {
  return done(await inTenant((tx) => updateClass(tx, id, input)));
}

export async function setClassArchivedAction(id: string, archived: boolean) {
  return done(await inTenant((tx) => setClassArchived(tx, id, archived)));
}

export async function deleteClassAction(
  id: string,
  force: boolean,
): Promise<ActionResult | { ok: false; error: "not-empty"; members: number }> {
  const result = await inTenant((tx) => deleteClass(tx, id, { force }));
  if (result.status === "not-empty")
    return { ok: false, error: "not-empty", members: result.members };
  return done(result);
}

export async function addToClassAction(userIds: string[], teamId: string) {
  return done(await inTenant((tx) => addToClass(tx, userIds, teamId)));
}

export async function removeFromClassAction(userIds: string[], teamId: string) {
  return done(await inTenant((tx) => removeFromClass(tx, userIds, teamId)));
}

export async function setMemberRoleAction(userId: string, role: MemberRole) {
  return done(await inTenant((tx) => setMemberRole(tx, userId, role)));
}

export async function setMemberStatusAction(userIds: string[], status: MemberStatus) {
  return done(await inTenant((tx) => setMemberStatus(tx, userIds, status)));
}

export async function removeMembersAction(userIds: string[]) {
  return done(await inTenant((tx) => removeMembers(tx, userIds)));
}

/**
 * Adds a person and emails them. A failed email does not undo the addition:
 * they can sign in with their address anyway, and the UI says so.
 */
export async function addPersonAction(input: {
  name: string;
  email: string;
  role: MemberRole;
  classIds: string[];
  sendWelcome: boolean;
}): Promise<{ ok: true; name: string; emailSent: boolean } | { ok: false; error: ActionError }> {
  const tenant = await requireTenant();
  const result = await addPerson(getDb(), tenant.context, input);
  if (result.status !== "added") return done(result) as { ok: false; error: ActionError };
  done({ status: "ok" });

  if (!input.sendWelcome) return { ok: true, name: result.name, emailSent: false };
  const { appName, appUrl } = getConfig();
  try {
    const message = await renderWelcomeEmail({
      locale: resolveLocale({ user: result.locale, acceptLanguage: await getLocale() }),
      appName,
      organization: tenant.organization.name,
      inviter: tenant.user.name,
      name: result.name,
      role: input.role,
      newAccount: result.newAccount,
      signInUrl: `${appUrl}/login?email=${encodeURIComponent(result.email)}`,
    });
    await getEmailTransport().send({ to: result.email, ...message });
    return { ok: true, name: result.name, emailSent: true };
  } catch (error) {
    console.error("[people] welcome email not delivered", result.email, error);
    return { ok: true, name: result.name, emailSent: false };
  }
}
