/*
 * Prerequisite rules for program enrollments, as pure functions over the
 * enrollments of one target (a class or a student). No database access, so
 * the rules are unit-tested and the caller loads the siblings once.
 */

export interface EnrollmentNode {
  id: string;
  teamId: string | null;
  userId: string | null;
  requiresEnrollmentId: string | null;
}

export type PrerequisiteCheck =
  { ok: true } | { ok: false; reason: "self" | "different-target" | "cycle" };

/**
 * Walking the chain from `start`, do we arrive at `target`? Bounded and
 * loop-safe: corrupt data (a hand-made cycle) must not spin forever.
 */
export function chainReaches(
  start: string,
  target: string,
  chain: ReadonlyMap<string, string | null>,
  maxSteps = 100,
): boolean {
  let cursor: string | null = start;
  const seen = new Set<string>();
  for (let step = 0; cursor && step < maxSteps; step += 1) {
    if (cursor === target) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = chain.get(cursor) ?? null;
  }
  return false;
}

/**
 * May `enrollment` wait for `prerequisite`?
 * - not itself;
 * - same target: another class finishing a program says nothing about this
 *   one, and the lock would never open;
 * - no cycle: two programs waiting for each other never open.
 */
export function checkPrerequisite(
  enrollment: EnrollmentNode,
  prerequisite: EnrollmentNode | null,
  siblings: readonly EnrollmentNode[],
): PrerequisiteCheck {
  if (!prerequisite) return { ok: true };
  if (prerequisite.id === enrollment.id) return { ok: false, reason: "self" };

  const sameTarget = enrollment.teamId
    ? prerequisite.teamId === enrollment.teamId
    : prerequisite.userId === enrollment.userId;
  if (!sameTarget) return { ok: false, reason: "different-target" };

  const chain = new Map(siblings.map((node) => [node.id, node.requiresEnrollmentId]));
  if (chainReaches(prerequisite.id, enrollment.id, chain)) return { ok: false, reason: "cycle" };
  return { ok: true };
}
