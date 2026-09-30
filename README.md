# zaydemy

An open-source learning platform for software education, built for individual
instructors, private academies and schools.

> **Status:** early development. Not ready for production use yet.

## Development

Requirements: Node.js 22.12+ (see `.nvmrc`) and pnpm 10.

```sh
pnpm install
pnpm dev          # web app on http://localhost:3010
```

Checks (the same ones CI runs):

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Repository layout

| Path                     | Purpose                                 |
| ------------------------ | --------------------------------------- |
| `apps/web`               | Next.js application                     |
| `packages/tsconfig`      | Shared TypeScript configuration         |
| `packages/eslint-config` | Shared ESLint configuration             |
| `ee/`                    | Enterprise modules (commercial license) |

## License

The core is licensed under the [GNU Affero General Public License v3.0](./LICENSE).
Code in [`ee/`](./ee) is licensed under the [zaydemy Enterprise License](./ee/LICENSE).
The zaydemy name and logo are not covered by either license.
