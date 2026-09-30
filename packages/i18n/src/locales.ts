/**
 * Supported locales. English is the source language: every message is written
 * in English first and other locales are translations of it.
 */
export const locales = ["en", "tr"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie that stores an explicit choice made before a user preference exists (e.g. on login). */
export const localeCookieName = "NEXT_LOCALE";

// Locales written right to left. None are shipped yet; listing them here is
// what switches `dir="rtl"` on when one is added.
const rtlLocales: ReadonlySet<string> = new Set<Locale>([]);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return rtlLocales.has(locale) ? "rtl" : "ltr";
}
