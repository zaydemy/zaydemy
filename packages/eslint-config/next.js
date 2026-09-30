import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import i18next from "eslint-plugin-i18next";
import { defineConfig, globalIgnores } from "eslint/config";

/** Rules for Next.js apps: Next's own presets plus our shared conventions. */
export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  nextVitals,
  nextTs,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Every user-facing string goes through i18n: literal text in JSX and
    // literals in the attributes people read or hear (labels, alt text,
    // titles, placeholders) fail lint. Other attributes carry identifiers,
    // class names, props and handler code, not copy.
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": {
            include: [
              "aria-label",
              "aria-description",
              "aria-placeholder",
              "aria-roledescription",
              "aria-valuetext",
              "alt",
              "title",
              "placeholder",
              "label",
            ],
          },
          // Arguments to translators (`t`, `tSettings`...) and formatters
          // (`format.dateTime(date, { dateStyle: "medium" })`) are keys and
          // options, not copy. The rest are the plugin's defaults.
          callees: {
            exclude: [
              "t",
              "t[A-Z]\\w*",
              "format\\.\\w+",
              "i18n(ext)?",
              "require",
              "addEventListener",
              "removeEventListener",
              "postMessage",
              "getElementById",
              "dispatch",
              "commit",
              "includes",
              "indexOf",
              "endsWith",
              "startsWith",
            ],
          },
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "i18next/no-literal-string": "off" },
  },
  prettier,
]);
