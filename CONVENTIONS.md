# Engineering Conventions

These conventions provide sensible defaults across common stacks. Adopt, tweak, or override per repository.

## Priorities
- 1) Correctness and build quality
- 2) DX/maintainability
- 3) UX polish and tasteful creativity

## Repository Layout
- `src/` (or `app/`): application/source code
- `tests/` (or `__tests__/`): automated tests
- `scripts/`: developer/CI scripts (idempotent, shell-safe)
- `docs/`: documentation and ADRs (architecture decision records)
- `.github/`: workflows, issue/PR templates, CODEOWNERS
- `Dockerfile`, `docker-compose.yml` (if containerized)
- `.env.example`: example environment variables

## Naming
- Files/dirs: kebab-case for configs, snake_case for Python modules, camelCase for JS files when idiomatic.
- Classes/Types: PascalCase (e.g., `UserService`)
- Variables/functions: camelCase (JS/TS), snake_case (Python), mixedCaps (Go)
- Constants: UPPER_SNAKE_CASE
- Branches: `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`, `perf/…`, `test/…`

## Code Style
- Use auto-formatters and linters; prefer rules over taste.
  - JS/TS: Prettier + ESLint (typescript-eslint)
  - Python: Black + Ruff (or Flake8 + isort)
  - Go: `gofmt` + `goimports`, `golangci-lint`
- Include `.editorconfig` to normalize whitespace/newlines.
- Keep functions small; avoid deep nesting; prefer pure functions where possible.
- For non‑obvious decisions, add a brief inline comment explaining the rationale.

## Testing
- Co-locate tests near code or under `tests/`.
- Naming:
  - JS/TS: `*.test.ts`/`*.spec.ts`
  - Python: `test_*.py`
  - Go: `*_test.go`
- Prioritize unit tests; add integration tests for critical paths; e2e for user flows.
- Use test doubles (mocks/stubs) for external systems; avoid real network calls.
- Keep tests deterministic and parallelizable.

## React/Next.js Patterns
- Prefer Next.js App Router with server components for data fetching and rendering by default; mark client components only when interactivity is needed.
- Use file‑based routing conventions; colocate component logic and styles. Place validation schemas in `lib/` or route/server actions — not in `components/`.
- Use shadcn/ui (Radix primitives) for accessible UI primitives in `components/ui/`; extend with Tailwind utilities.
- Keep pages lean; move complex UI/logic into components and hooks colocated under the relevant route folder.

## UX Layer Defaults
- Provide polished states: empty, loading, and error with actionable copy.
- Consistent spacing and typography using Tailwind scales; keep vertical rhythm consistent across views.
- Form DX: define validation schemas under `lib/` or route/server actions; infer types when sensible. Zod is optional — use it when form complexity warrants or CI/build checks require runtime validation.
- Accessibility: label controls, manage focus, respect reduced‑motion preferences.

## Validation
- Validate at boundaries (API handlers, forms) and fail fast with friendly messages.
- Prefer type-safe validation; Zod is optional. Introduce Zod when complexity increases or stronger runtime guarantees are necessary.

## Animation
- Use Motion (Framer Motion) for tasteful animations; keep durations snappy (150–250ms) and respect `prefers-reduced-motion`.
- Avoid excessive animation; prioritize clarity and performance.

## Component Modularity
- Avoid oversized pages/components. Split when they become long or are likely to grow.
- Reusable primitives live in `components/ui/` (buttons, cards, accordions, inputs, etc.). Do not store schemas or helper logic in `components/`.
- Feature‑specific components live near their routes under `app/<route>/` (or a feature folder within `app/`) rather than under `components/`.
- Not everything needs its own component; use judgment to keep files readable and cohesive.

## Type Safety & Correctness
- Enable strict TypeScript where applicable; prefer explicit types on public boundaries.
- Code must build/compile cleanly; add tests for critical logic and edge cases.

## Git & PRs
- Conventional Commits; descriptive PR titles and bodies with context and screenshots for UI.
- Small, focused PRs; one concern at a time; squash merge.
- Link issues (`Closes #123`) and document decisions in PR description.

## CI/CD
- Minimal pipeline stages: install → lint → test → build/package → (scan) → deploy.
- Protect `main`; require checks to pass; keep pipelines <10 minutes where feasible.
- Cache dependencies; pin tool versions for reproducibility.

## Dependencies
- Commit lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `poetry.lock`, `go.sum`).
- Prefer minimal, well-maintained deps; review licenses. Favor first‑party or widely adopted libraries.
- Automate updates (Renovate or Dependabot) and batch weekly.

## Configuration & Secrets
- 12-factor: configuration via environment variables.
- Provide `.env.example`; do not commit `.env` with secrets.
- Use secret managers (GitHub Actions Secrets, cloud KMS) for CI/CD.

## Documentation
- Each repo has a `README` with: purpose, quickstart, common tasks, testing, release.
- Maintain a `CHANGELOG` (generated from commits is fine).
- Consider ADRs in `docs/adrs/` for significant decisions.
- Maintain a `PROJECT_UPDATES.md` that summarizes major updates with date/time (UTC), bundled minor updates, and next actions so anyone can quickly understand current status.

## Observability
- Logging: use structured logs (JSON) in services; respect log levels; avoid PII.
- Metrics: expose basic health/latency/error counters if applicable.

## Performance & Reliability
- Measure before optimizing; add benchmarks where performance-critical.
- Timeouts, retries with backoff for I/O; circuit breakers when appropriate.

## Security
- Keep runtimes up to date; scan dependencies in CI.
- Validate inputs; sanitize outputs; least-privilege defaults.
- Add `SECURITY.md` if accepting reports; define disclosure process.

## Versioning & Releases
- Semantic Versioning (`MAJOR.MINOR.PATCH`).
- Tag releases `vX.Y.Z`; automate releases based on commit history when possible.

---
These defaults aim to reduce bikeshedding and increase consistency. Override locally as needed and document the deviation in `CONTRIBUTING.md`.
