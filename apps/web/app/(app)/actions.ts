"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/server/auth";

export async function signOut() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}

/** Picks the organization the UI shows. Better Auth checks the membership. */
export async function switchOrganization(organizationId: string) {
  await getAuth().api.setActiveOrganization({ headers: await headers(), body: { organizationId } });
  redirect("/");
}
