import { schema } from "@zaydemy/db";
import { useTestDatabase } from "@zaydemy/db/testing";
import { describe, expect, it } from "vitest";
import { isRateLimited, pruneRateLimitHits } from "./rate-limit";
import { completeSetup, isSetupRequired, isTimeZone, slugify } from "./setup";

const database = useTestDatabase();

describe("rate limit", () => {
  const rule = { windowMs: 60_000, max: 2 };

  it("allows up to the limit within the window, per key", () =>
    database.rollback(async (tx) => {
      const t0 = new Date("2026-01-01T10:00:00Z");
      expect(await isRateLimited(tx, "otp:a", rule, t0)).toBe(false);
      expect(await isRateLimited(tx, "otp:a", rule, t0)).toBe(false);
      expect(await isRateLimited(tx, "otp:a", rule, t0)).toBe(true);
      expect(await isRateLimited(tx, "otp:b", rule, t0)).toBe(false);

      const later = new Date(t0.getTime() + 61_000);
      expect(await isRateLimited(tx, "otp:a", rule, later)).toBe(false);
    }));

  it("prunes old hits", () =>
    database.rollback(async (tx) => {
      await isRateLimited(tx, "k", rule, new Date("2026-01-01T00:00:00Z"));
      await isRateLimited(tx, "k", rule, new Date("2026-01-03T00:00:00Z"));
      expect(await pruneRateLimitHits(tx, new Date("2026-01-02T00:00:00Z"))).toBe(1);
    }));
});

describe("setup", () => {
  it("recognizes IANA time zones", () => {
    expect(isTimeZone("Europe/Istanbul")).toBe(true);
    expect(isTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
  });

  it("slugifies names, including Turkish letters", () => {
    expect(slugify("Işık Yazılım Akademisi")).toBe("isik-yazilim-akademisi");
    expect(slugify("İstanbul Kodlama Okulu")).toBe("istanbul-kodlama-okulu");
    expect(slugify("  ---  ")).toBe("organization");
  });

  it("creates the platform admin, the organization and the ownership once", async () => {
    expect(await isSetupRequired(database.db)).toBe(true);

    const input = {
      name: "Ayşe Yılmaz",
      email: " Ayse@Example.com ",
      organizationName: "Kodlama Akademisi",
      preset: "academy" as const,
      locale: "tr",
      timeZone: "Europe/Istanbul",
    };
    // Concurrent attempts: exactly one wins.
    const results = await Promise.all([
      completeSetup(database.db, input),
      completeSetup(database.db, input),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["already-set-up", "created"]);
    expect(await isSetupRequired(database.db)).toBe(false);

    const users = await database.db.select().from(schema.user);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: "ayse@example.com",
      platformRole: "admin",
      emailVerified: true,
    });

    const [org] = await database.db.select().from(schema.organization);
    expect(org).toMatchObject({
      slug: "kodlama-akademisi",
      preset: "academy",
      defaultLocale: "tr",
    });
    const [owner] = await database.db.select().from(schema.member);
    expect(owner).toMatchObject({ organizationId: org!.id, userId: users[0]!.id, role: "owner" });
  });
});
