import { schema } from "@zaydemy/db";
import { createUser, useTestDatabase } from "@zaydemy/db/testing";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { updateOwnProfile } from "./profile";

const database = useTestDatabase();

describe("updateOwnProfile", () => {
  it("updates name and locale, and only for that user", () =>
    database.rollback(async (tx) => {
      const me = await createUser(tx, { name: "Old" });
      const other = await createUser(tx, { name: "Other" });

      expect(await updateOwnProfile(tx, me.id, { name: "  New Name  ", locale: "tr" })).toEqual({
        status: "updated",
      });
      const [row] = await tx.select().from(schema.user).where(eq(schema.user.id, me.id));
      expect(row).toMatchObject({ name: "New Name", locale: "tr" });

      await updateOwnProfile(tx, me.id, { locale: null });
      const [cleared] = await tx.select().from(schema.user).where(eq(schema.user.id, me.id));
      expect(cleared?.locale).toBeNull();

      const [untouched] = await tx.select().from(schema.user).where(eq(schema.user.id, other.id));
      expect(untouched?.name).toBe("Other");
    }));

  it("rejects an empty name", () =>
    database.rollback(async (tx) => {
      const me = await createUser(tx);
      expect(await updateOwnProfile(tx, me.id, { name: "   " })).toEqual({
        status: "invalid-name",
      });
    }));
});
