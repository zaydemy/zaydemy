import { defaultLocale, isLocale, type Locale } from "./locales";

export interface LocaleSources {
  /** The signed-in user's saved preference. */
  user?: string | null;
  /** An explicit choice stored in a cookie (before sign-in, or without a saved preference). */
  cookie?: string | null;
  /** The organization's default locale. */
  organization?: string | null;
  /** The raw `Accept-Language` request header. */
  acceptLanguage?: string | null;
}

/**
 * Picks the locale for a request. Precedence, most specific first:
 * user preference → cookie → organization default → browser → `en`.
 *
 * Unsupported or malformed values are skipped rather than trusted, so a stale
 * preference (a locale that was removed) falls through to the next source.
 */
export function resolveLocale(sources: LocaleSources): Locale {
  for (const candidate of [sources.user, sources.cookie, sources.organization]) {
    const locale = matchLocale(candidate);
    if (locale) return locale;
  }
  return negotiateAcceptLanguage(sources.acceptLanguage) ?? defaultLocale;
}

/** Maps a language tag such as `tr-TR` or `EN` to a supported locale. */
export function matchLocale(tag: string | null | undefined): Locale | undefined {
  if (!tag) return undefined;
  const normalized = tag.trim().toLowerCase();
  if (isLocale(normalized)) return normalized;
  const language = normalized.split("-")[0];
  return isLocale(language) ? language : undefined;
}

/**
 * Returns the supported locale with the highest quality value in an
 * `Accept-Language` header, e.g. `tr-TR,tr;q=0.9,en;q=0.8` → `tr`.
 */
export function negotiateAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;

  const ranges = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((range) => range.tag && range.tag !== "*" && range.quality > 0)
    // Stable: equal quality keeps header order.
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const range of ranges) {
    const locale = matchLocale(range.tag);
    if (locale) return locale;
  }
  return undefined;
}
