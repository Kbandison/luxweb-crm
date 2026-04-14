# Contributing Guidelines

Thank you for contributing! This document sets clear, lightweight defaults that work across most projects. Adapt per-repo as needed.

## Project Priorities
- 1) Correctness and build quality
- 2) Developer experience (DX) and maintainability
- 3) UX polish and tasteful creativity

## Quick Start
- Fork or create a branch off `main` using GitHub Flow.
- Write small, focused changes with tests and docs.
- Use Conventional Commits for messages (examples below).
- Open a draft PR early; convert to ready when checks pass.

## Project Workflow
- Branching: `main` is protected. Create branches like:
  - `feat/<short-description>` for new features
  - `fix/<short-description>` for bug fixes
  - `chore/<short-description>` for maintenance
  - `docs/<short-description>` for docs-only changes
  - `refactor/<short-description>`, `perf/<short-description>`, `test/<short-description>` as needed
- One logical change per PR; keep PRs under ~300 lines when possible.
- Discuss significant changes via an issue first.

## Commit Messages (Conventional Commits)
Format: `<type>(<optional scope>): <short summary>`

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Examples:
- `feat(api): add pagination to list endpoint`
- `fix(ui): prevent null deref on empty state`
- `docs: add quickstart to README`

Breaking changes:
- Include `!` after type or add a `BREAKING CHANGE:` footer.

## Pull Requests
- Link related issues (e.g., `Closes #123`).
- Ensure PR title also follows Conventional Commits when possible.
- Checklist before requesting review:
  - Lint/format passes locally
  - Unit tests updated/added and pass
  - Docs updated (`README`, `CHANGELOG`, examples)
  - For major changes: update `PROJECT_UPDATES.md` with date/time (UTC), summary, minor updates, and next actions
  - No secrets or large artifacts committed
- Prefer squash merge to keep a clean history.

## Code Review
- Be kind, specific, and actionable.
- Reviewers check: correctness, tests, readability, security, and performance risks.
- Authors respond to all comments or clarify why not.
- Non-blocking nits may be deferred; avoid scope creep.
 - Briefly explain non‑obvious choices with a short inline comment when helpful.

## Testing
- Aim for meaningful unit tests; add integration tests for critical flows.
- Default coverage goal: ~80% lines/branches (adjust per repo).
- Place tests alongside code (e.g., `src/**` with `tests/**`) or per-language norms:
  - JS/TS: `**/*.test.ts` or `__tests__/`
  - Python: `tests/test_*.py`
  - Go: `*_test.go`
- Example commands (adjust per repo):
  - JS/TS: `npm test` / `pnpm test`
  - Python: `pytest`
  - Go: `go test ./...`

## Style and Linting
- Use automatic formatters; don’t fight them.
  - JS/TS: Prettier + ESLint
  - Python: Black + Ruff (or Flake8/isort)
  - Go: `gofmt`/`goimports`
- Include an `.editorconfig` when possible.
 - For Next.js + React + Tailwind + shadcn/ui projects, follow our patterns in `CONVENTIONS.md` (server components where possible, client components for interactivity, accessible primitives, consistent spacing/typography). Keep `components/ui/` for reusable UI primitives only; place schemas/helpers in `lib/` or route/server actions; centralize dummy data in `data/index.ts`.

## CI/CD
- PRs must pass: install, build (if applicable), lint, test.
- Keep pipelines fast; cache dependencies.
- Block merges on failing checks.
 - Ensure new code compiles/builds cleanly and is type‑safe (TypeScript projects).

## Security & Secrets
- Never commit credentials, tokens, or private data.
- Use `.env.example` to document required env vars.
- Report vulnerabilities privately (add `SECURITY.md` in repos that accept reports).

## Releases
- Use Semantic Versioning: `MAJOR.MINOR.PATCH`.
- Recommend automated release from `main` (e.g., Release Please, semantic-release) based on Conventional Commits.
- Tag format: `vX.Y.Z`. Maintain a `CHANGELOG.md` (generated is fine).

## Licensing and Ownership
- Include a `LICENSE` file per repo.
- Add `CODEOWNERS` for critical paths if applicable.

## Communication
- Prefer issues for proposals/bugs, PRs for changes.
- Write concise descriptions with context, rationale, and alternatives.
 - Unknown specs/APIs: do not invent. Propose options and request a one‑line decision; proceed with a sane default if needed.

## Dependencies
- Keep dependencies lean; prefer first‑party or widely adopted libraries.
- Avoid introducing a new library when a standard/first‑party solution exists.

---
Adapt these defaults to fit your stack and team norms.
