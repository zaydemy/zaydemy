# Contributing to zaydemy

Thanks for your interest in contributing.

## Before you start

- **Contributor License Agreement.** zaydemy is dual-licensed (AGPL-3.0 core and
  a commercial license for `ee/`), so contributions must be relicensable. You will
  be asked to sign a CLA on your first pull request.
- **English first.** Code, comments, commit messages and documentation are in
  English. User-facing text is never hardcoded: it goes through the i18n message
  files, with English as the source language.

## Workflow

1. Create a branch for your change.
2. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and
   `pnpm build` locally.
3. Open a pull request describing what changed and why.
