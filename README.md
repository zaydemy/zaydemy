# zaydemy

An open-source learning platform for software education, built for individual
instructors, private academies and schools.

> **Status:** early development. Not ready for production use yet.

## Development

Requirements: Node.js 22.12+ (see `.nvmrc`), pnpm 10 and PostgreSQL 16+.

```sh
pnpm install
cp .env.example .env   # every variable is documented there
pnpm db:migrate
pnpm dev               # web app on http://localhost:3010
```

Checks (the same ones CI runs):

```sh
pnpm format:check
pnpm i18n:check
pnpm db:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Repository layout

| Path                     | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `apps/web`               | Next.js application                            |
| `packages/adapters`      | Email, file storage and bot protection drivers |
| `packages/config`        | Environment validation                         |
| `packages/core`          | Business logic, tenant-scoped data access      |
| `packages/db`            | Schema, migrations, test database harness      |
| `packages/i18n`          | Locales, message catalogs, locale resolution   |
| `packages/tsconfig`      | Shared TypeScript configuration                |
| `packages/eslint-config` | Shared ESLint configuration                    |
| `ee/`                    | Enterprise modules (commercial license)        |

## Internationalization

English is the source language; every other locale is a translation.

- Messages live in `packages/i18n/messages/<locale>.json`. Add new keys to
  `en.json` first, then translate them in every other catalog.
- User-facing text is never hardcoded. ESLint rejects literal strings in JSX,
  including readable attributes such as `aria-label`, `alt` and `placeholder`.
- `pnpm i18n:check` fails on missing, unused or undefined keys and on ICU
  arguments that differ from the source; a test in `packages/i18n` fails on keys
  that exist only in a translation.
- The locale is resolved per request: user preference, then the `NEXT_LOCALE`
  cookie, then the organization default, then the browser, then English.

## License

The core is licensed under the [GNU Affero General Public License v3.0](./LICENSE).
Code in [`ee/`](./ee) is licensed under the [zaydemy Enterprise License](./ee/LICENSE).
The zaydemy name and logo are not covered by either license.
