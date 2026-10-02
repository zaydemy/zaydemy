import { describe, expect, it } from "vitest";
import { chainReaches, checkPrerequisite, type EnrollmentNode } from "./prerequisite";

const node = (
  id: string,
  requires: string | null = null,
  target: Partial<EnrollmentNode> = { teamId: "class-a" },
) =>
  ({
    id,
    teamId: null,
    userId: null,
    requiresEnrollmentId: requires,
    ...target,
  }) satisfies EnrollmentNode;

describe("chainReaches", () => {
  const chain = new Map<string, string | null>([
    ["js", "css"],
    ["css", "html"],
    ["html", null],
  ]);

  it("follows the chain to its end", () => {
    expect(chainReaches("js", "html", chain)).toBe(true);
    expect(chainReaches("html", "js", chain)).toBe(false);
  });

  it("stops on corrupt cycles that do not contain the target", () => {
    const loop = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(chainReaches("a", "z", loop)).toBe(false);
  });
});

describe("checkPrerequisite", () => {
  const html = node("html");
  const css = node("css", "html");
  const js = node("js", "css");
  const siblings = [html, css, js];

  it("accepts a chain and removing a prerequisite", () => {
    expect(checkPrerequisite(js, css, siblings)).toEqual({ ok: true });
    expect(checkPrerequisite(js, null, siblings)).toEqual({ ok: true });
  });

  it("rejects waiting for itself", () => {
    expect(checkPrerequisite(html, html, siblings)).toEqual({ ok: false, reason: "self" });
  });

  it("rejects cycles, direct and through the chain", () => {
    expect(checkPrerequisite(html, css, siblings)).toEqual({ ok: false, reason: "cycle" });
    expect(checkPrerequisite(html, js, siblings)).toEqual({ ok: false, reason: "cycle" });
  });

  it("rejects a prerequisite given to another class or student", () => {
    const other = node("other", null, { teamId: "class-b" });
    expect(checkPrerequisite(js, other, [...siblings, other])).toEqual({
      ok: false,
      reason: "different-target",
    });
    const mine = node("mine", null, { teamId: null, userId: "u1" });
    const theirs = node("theirs", null, { teamId: null, userId: "u2" });
    expect(checkPrerequisite(mine, theirs, [mine, theirs])).toEqual({
      ok: false,
      reason: "different-target",
    });
  });
});
