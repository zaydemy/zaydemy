import { memberRoles } from "@zaydemy/db/schema";
import { describe, expect, it } from "vitest";
import { assignableRoles, canManageMember, isStaff, managesOrganization } from "./permissions";

describe("permissions", () => {
  it("lets each role grant only roles below it (owners grant everything)", () => {
    expect(assignableRoles("owner")).toEqual(["owner", "admin", "instructor", "student"]);
    expect(assignableRoles("admin")).toEqual(["instructor", "student"]);
    expect(assignableRoles("instructor")).toEqual(["student"]);
    expect(assignableRoles("student")).toEqual([]);
  });

  it("matches the management table", () => {
    const table = Object.fromEntries(
      memberRoles.map((actor) => [
        actor,
        memberRoles.filter((target) => canManageMember(actor, target)),
      ]),
    );
    expect(table).toEqual({
      owner: ["owner", "admin", "instructor", "student"],
      admin: ["instructor", "student"],
      instructor: ["student"],
      student: [],
    });
  });

  it("separates organization management and staff", () => {
    expect(memberRoles.filter(managesOrganization)).toEqual(["owner", "admin"]);
    expect(memberRoles.filter(isStaff)).toEqual(["owner", "admin", "instructor"]);
  });
});
