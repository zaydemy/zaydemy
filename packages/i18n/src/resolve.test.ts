import { describe, expect, it } from "vitest";
import { matchLocale, negotiateAcceptLanguage, resolveLocale } from "./resolve";

describe("matchLocale", () => {
  it("accepts supported locales regardless of case and region", () => {
    expect(matchLocale("tr")).toBe("tr");
    expect(matchLocale("TR-tr")).toBe("tr");
    expect(matchLocale(" en-GB ")).toBe("en");
  });

  it("rejects unsupported or empty tags", () => {
    expect(matchLocale("de-DE")).toBeUndefined();
    expect(matchLocale("")).toBeUndefined();
    expect(matchLocale(null)).toBeUndefined();
  });
});

describe("negotiateAcceptLanguage", () => {
  it("picks the highest quality supported locale", () => {
    expect(negotiateAcceptLanguage("de;q=1, tr;q=0.8, en;q=0.9")).toBe("en");
    expect(negotiateAcceptLanguage("tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("tr");
  });

  it("keeps header order when qualities are equal", () => {
    expect(negotiateAcceptLanguage("tr, en")).toBe("tr");
  });

  it("ignores wildcards, q=0 and malformed quality values", () => {
    expect(negotiateAcceptLanguage("*")).toBeUndefined();
    expect(negotiateAcceptLanguage("tr;q=0, en;q=0.1")).toBe("en");
    expect(negotiateAcceptLanguage("tr;q=abc")).toBeUndefined();
  });

  it("returns undefined when nothing is supported", () => {
    expect(negotiateAcceptLanguage("de, fr")).toBeUndefined();
    expect(negotiateAcceptLanguage(undefined)).toBeUndefined();
  });
});

describe("resolveLocale", () => {
  it("prefers user, then cookie, then organization, then browser", () => {
    const all = { user: "tr", cookie: "en", organization: "en", acceptLanguage: "en" };
    expect(resolveLocale(all)).toBe("tr");
    expect(resolveLocale({ ...all, user: null, cookie: "tr" })).toBe("tr");
    expect(resolveLocale({ ...all, user: null, cookie: null, organization: "tr" })).toBe("tr");
    expect(
      resolveLocale({ user: null, cookie: null, organization: null, acceptLanguage: "tr" }),
    ).toBe("tr");
  });

  it("skips a stale preference for an unsupported locale", () => {
    expect(resolveLocale({ user: "de", organization: "tr" })).toBe("tr");
  });

  it("falls back to English", () => {
    expect(resolveLocale({})).toBe("en");
    expect(resolveLocale({ acceptLanguage: "ja" })).toBe("en");
  });
});
