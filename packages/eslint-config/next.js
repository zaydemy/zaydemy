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
    // Every user-facing string goes through i18n: literal text in JSX, and
    // literals in attributes that users read (aria-label, title, alt,
    // placeholder...), fail lint. Attributes listed below carry identifiers,
    // URLs or styling, not copy.
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": {
            exclude: [
              "className",
              "style",
              "type",
              "key",
              "id",
              "width",
              "height",
              "href",
              "src",
              "rel",
              "target",
              "lang",
              "dir",
              "name",
              "method",
              "role",
              "htmlFor",
              "autoComplete",
              "inputMode",
              "sizes",
              "as",
              "variant",
              "size",
              "data-.*",
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
