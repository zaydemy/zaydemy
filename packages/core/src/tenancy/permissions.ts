import type { MemberRole } from "@zaydemy/db/schema";

/*
 * Who may do what inside one organization. Rules live here, in one place, and
 * are tested as a table; data functions call them before writing.
 *
 *   owner       everything, including granting owner and admin
 *   admin       manages classes and people, but not owners or other admins
 *   instructor  manages students in the classes they teach
 *   student     nothing administrative
 */

const staffRoles: ReadonlySet<MemberRole> = new Set(["owner", "admin", "instructor"]);

export function isStaff(role: MemberRole): boolean {
  return staffRoles.has(role);
}

/** Create, rename, archive and delete classes; see every class and person. */
export function managesOrganization(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

/** Roles an actor may give to someone (when adding them or changing their role). */
export function assignableRoles(actor: MemberRole): readonly MemberRole[] {
  switch (actor) {
    case "owner":
      return ["owner", "admin", "instructor", "student"];
    case "admin":
      return ["instructor", "student"];
    case "instructor":
      return ["student"];
    case "student":
      return [];
  }
}

/**
 * May the actor change a member who currently has `targetRole`? Admins do
 * not manage owners or other admins; instructors only manage students.
 */
export function canManageMember(actor: MemberRole, targetRole: MemberRole): boolean {
  return assignableRoles(actor).includes(targetRole);
}
