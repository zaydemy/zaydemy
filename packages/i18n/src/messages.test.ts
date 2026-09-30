import { describe, expect, it } from "vitest";
import { defaultLocale, locales } from "./locales";
import { loadMessages } from "./messages";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("message catalogs", () => {
  // i18n-check reports keys missing from a translation, but not keys that
  // exist only in a translation. Both directions must match the source.
  it.each(locales.filter((l) => l !== defaultLocale))(
    "%s has exactly the source locale's keys",
    async (locale) => {
      const source = flattenKeys(await loadMessages(defaultLocale)).sort();
      const translation = flattenKeys(await loadMessages(locale)).sort();
      expect(translation).toEqual(source);
    },
  );
});
