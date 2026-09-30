"use server";

import { completeSetup } from "@zaydemy/core";
import { organizationPresets, type OrganizationPreset } from "@zaydemy/db/schema";
import { isLocale } from "@zaydemy/i18n";
import { getDb } from "@/lib/server/db";

export type SetupState =
  | { status: "idle" }
  | { status: "error"; reason: "required" | "invalid-email" | "already-set-up" }
  | { status: "done"; email: string };

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Creates the first account. Safe to expose without a session: it only
 * succeeds while no account exists (checked under a lock in completeSetup).
 */
export async function setUp(_previous: SetupState, form: FormData): Promise<SetupState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const organizationName = String(form.get("organization") ?? "").trim();
  const preset = String(form.get("preset") ?? "");
  const locale = String(form.get("locale") ?? "");
  // Filled in by the browser; completeSetup ignores anything not IANA.
  const timeZone = String(form.get("timeZone") ?? "");

  if (
    !name ||
    !email ||
    !organizationName ||
    !(organizationPresets as readonly string[]).includes(preset)
  ) {
    return { status: "error", reason: "required" };
  }
  if (!emailPattern.test(email)) return { status: "error", reason: "invalid-email" };

  const result = await completeSetup(getDb(), {
    name,
    email,
    organizationName,
    preset: preset as OrganizationPreset,
    locale: isLocale(locale) ? locale : undefined,
    timeZone: timeZone || undefined,
  });
  return result.status === "created"
    ? { status: "done", email }
    : { status: "error", reason: "already-set-up" };
}
