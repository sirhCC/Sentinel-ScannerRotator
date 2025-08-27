# Priority work list — SecretSentinel-ScannerRotator

This file is a single, ordered list of work to do for the project. Highest priority items are at the top. Use this as the single source of truth and work sequentially from top to bottom unless blockers are reported.

---

Legend:

- 🟥 DONE — completed
- ⬜ TODO — not started
- 🟨 IN PROGRESS — partial

## P0 — Immediate (blockers/security/critical correctness)

1. Make scanner recursive and respect ignore patterns (e.g., .gitignore) — implement fast, tested recursion with optional depth and a default ignore list. (Owner: TBD)
	- 🟥 [DONE 2025-08-23] Implemented recursive scanning and `.gitignore` support; added `src/ignore.ts`, updated `src/scanner.ts`, and `test/scan-recursive.test.ts` (tests passing).
2. Add safe-file-update strategy for `apply` rotator: create per-file backup, atomic replace (write temp -> rename), and rollback on error. Critical for safety.
	- 🟥 [DONE 2025-08-23] Implemented `src/fileSafeUpdate.ts`, updated `src/rotators/applyRotator.ts`, and added tests `test/apply-rotator.test.ts` to verify backup and rollback.
3. Add CLI flag `--dry-run` and ensure `--rotator apply` requires an explicit `--force` confirmation in non-interactive runs (or env var).
	- 🟥 [DONE 2025-08-23] Implemented `runCli` in `src/index.ts`, added `--dry-run` and `--force` flags, and `test/cli.test.ts` to validate behavior.
4. Harden regexes and allow configurable rules: move patterns to `config/defaults.json` with ability to load user config.
	- 🟥 [DONE 2025-08-23] Added `config/defaults.json`, `src/config.ts` loader, and updated `src/scanner.ts` to load patterns from config.
5. Add logging with levels (error, warn, info, debug) and structured JSON output option for automation/CI.
	- 🟥 [DONE 2025-08-23] Added `src/logger.ts` with leveled logging and JSON output via `--log-json` and `--log-level` flags.
6. Add Node type support and fix any missing type errors (ensure `@types/node` is installed and tsconfig configured).
	- 🟥 [DONE 2025-08-23] Added `@types/node` to devDependencies and resolved type issues needed to compile and run tests.
7. Add unit tests for core behaviors: recursive scanning, pattern matching, and safe apply; ensure CI can run tests headless.
	- 🟥 [DONE 2025-08-23] Added unit tests for scanner, recursive ignore, config-based patterns, apply-rotator behavior, and a CLI test harness. Tests run headless via `vitest run`.
8. Add e2e test harness that runs against a temporary repo (creates files, runs scanner with both rotators, verifies outcomes).
	- 🟥 [DONE 2025-08-23] Added `test/e2e.test.ts` which runs dry-run and apply against a temporary repo and verifies backups.
9. Add license and security policy (SECURITY.md) and update README with clear warnings about `apply`.
	- 🟥 [DONE 2025-08-23] Added `LICENSE` (MIT), `SECURITY.md`, and README warning about `apply`.
	- 🟥 [DONE 2025-08-23] Verified README contains explicit warning and guidance for `apply` usage.

## P1 — High (release-readiness features)

1. Implement ignore config parsing: support `.gitignore`, `.secretignore`, and CLI `--ignore` globs.
	- 🟥 [DONE 2025-08-23] Implemented `src/ignore.ts`, CLI `--ignore` support, and tests `test/ignore.test.ts`.
2. Add configuration file support (YAML/JSON) to allow customizing regexes, rotators, dry-run defaults, and exclude lists.
	- 🟥 [DONE 2025-08-23] Added runtime YAML/JSON loader in `src/config.ts` (supports `.secretsentinel.yaml` and `.secretsentinel.json`), added tests `test/config-file.test.ts`.
3. Improve `apply` rotator: support templated replacement or rotate to a secret manager (plugin points) rather than simple placeholder.
	- 🟥 [DONE 2025-08-25] Added templated replacement tokens to `apply` rotator (`{{match}}`, `{{timestamp}}`, `{{file}}`).
	- 🟥 [DONE 2025-08-25] Added new built-in `backend` rotator that stores secrets in a backend (file provider by default; optional AWS Secrets Manager) and replaces with a `secretref://<provider>/<key>` reference.
4. Add pluggable rotator interface and loader from `rotators/` directory (dynamic import), and doc for writing new rotators.
	- 🟥 [DONE 2025-08-23] Implemented dynamic loader `src/rotators/loader.ts`, wired CLI to load rotators and added `--rotators-dir` support, tests and README notes added.
5. Add unit tests for rotator implementations, including failure modes (write permission errors, partial replacements).
	- 🟥 [DONE 2025-08-25] Added `test/apply-rotator.test.ts` failure-mode coverage and `test/backend-rotator.test.ts` for file backend; stabilized temp-dir usage with `SENTINEL_TMP_DIR` per test to avoid flakiness.
6. Add comprehensive CLI help (`--help`) and validate flags with a parsing library (yargs/commander/zod for validation).
	- 🟥 [DONE 2025-08-23] Migrated to Commander with detailed help and short flags; added `--list-rotators` for discoverability and tests for it.
7. Add package scripts for linting and formatting and include ESLint + Prettier; enforce in CI.
	- 🟥 [DONE 2025-08-23] Added ESLint v9 flat config and Prettier; wired npm scripts (lint/format) and resolved warnings.
8. Add proper CI pipeline (GitHub Actions): install, lint, build, test, security scan, and package step.
	- 🟥 [DONE 2025-08-23] Added CI workflow to install, lint, build, and test on push/PR to main. Security scan/package can be added later as separate jobs.

## P2 — Medium (integrations, UX, safety)

1. Rotator integrations: implement connectors for at least one secret backend (e.g., AWS Secrets Manager or Vault) as an example `apply` rotator.
	- 🟥 [DONE 2025-08-25] Implemented `backend` rotator with file provider (default) and optional AWS Secrets Manager (SDK optional, lazy-loaded). Docs updated.
	- Follow-ups:
		- 🟥 [DONE 2025-08-26] Added HashiCorp Vault provider (KV v2) with optional VAULT_NAMESPACE and verify mode parity.
		- 🟥 [DONE 2025-08-26] Added CLI e2e test path using `--rotator backend` (file provider): `test/e2e-backend.test.ts`.
2. Add interactive mode for review: show findings in an interactive TUI (fuzzy-select) to approve per-finding rotations.
	- 🟥 [DONE 2025-08-25] Added `--interactive` flag with per-finding approval and `SENTINEL_INTERACTIVE_AUTO` for automation.
3. Add permissions and dry-run audit logs: produce a signed audit artifact describing changes that would be made and what was changed when applied.
	- 🟥 [DONE 2025-08-25] Added NDJSON audit logging (`--audit`). Each event includes a SHA-256 hash; optional HMAC-SHA256 signature via `SENTINEL_AUDIT_SIGN_KEY` and `SENTINEL_AUDIT_SIGN_KEY_ID`.
4. Add concurrent scanning and rotator throttling for performance on large repos (worker pool size, rate-limiting rotator calls).
	- 🟥 [DONE 2025-08-25] Added scan concurrency (worker pool with `--scan-concurrency` / `SENTINEL_SCAN_CONCURRENCY`) and rotation concurrency (grouped by file to avoid parallel edits; `--rotate-concurrency` / `SENTINEL_ROTATE_CONCURRENCY`). Tests added for parity.
5. Add an option to persist findings to an output format (JSON/CSV) for integrations with ticketing/alerting.
	- 🟥 [DONE 2025-08-25] Added `--out` and `--out-format` to export findings as JSON or CSV (with extension inference). Docs and tests included.
6. Add caching to avoid re-scanning unchanged files (file mtime + size cache) to speed repeated runs.
	- 🟥 [DONE 2025-08-26] Added persistent cache with `--cache <file>` or `SENTINEL_CACHE` env; integrates into scanner to reuse findings when mtime/size unchanged. Tests added (`test/cache.test.ts`).
	- 🟥 [DONE 2025-08-26] Added optional hash mode (`SENTINEL_CACHE_MODE=hash`) to validate cache hits with SHA-256 and store content hashes; default remains `mtime`.

7. Add CI gating flags to fail the pipeline on findings.
	- 🟥 [DONE 2025-08-26] Added `--fail-on-findings` and `--fail-threshold` with documented non-zero exit codes; tests in `test/cli.test.ts`.

## P3 — Lower priority (polish & enterprise features)

1. Add ruleset library and rule marketplace (curated regexes, entropy checks, ML model hook) — long-term.
	- 🟨 [IN PROGRESS 2025-08-26] Introduced curated built-in rules with severities and custom rules via config; scanners now emit `ruleName` and `severity`. Opt-in entropy detector added (SENTINEL_ENTROPY).
	- 🟨 [IN PROGRESS 2025-08-26] Added curated ruleset library with `--list-rulesets`, `--rulesets`, and `--rulesets-dirs`; supports disabling built-ins via `--disable-builtin-rules`.
	- 🟨 [IN PROGRESS 2025-08-26] Added optional ML hook via `SENTINEL_ML_HOOK` to enrich detections.
	- ⬜ Remaining: hosted marketplace UI, remote catalog sync, and trust/signature model for third-party rulesets; ML model packaging.
2. Add policy engine to define allowed/forbidden patterns and auto-create issues in trackers when high-severity findings are found.
	- 🟨 [IN PROGRESS 2025-08-26] Policy loader reads thresholds and forbidden rules from project config; CLI enforces per-severity/total thresholds and forbidden rules with `--fail-on-findings`. (Issue creation/integrations deferred.)
3. Add roll-forward and roll-back strategies for rotators integrated with external secret stores (i.e., ability to re-create secrets or rotate back to previous values).
	- 🟨 [IN PROGRESS 2025-08-26] Added `sentinel undo <file>` subcommand to restore the most recent on-disk backup created by safe updates. Backend roll-forward/back remains to be designed.
4. Add scanning plugins for binary files and common artifact formats (Dockerfiles, environment files, zipped artifacts).
	- 🟨 [IN PROGRESS 2025-08-26] Scanner plugin system added; specialized scanners implemented:
		- ZIP archives (text entries only; guarded by size/entry limits)
		- TAR.GZ archives (text entries only; guarded by limits)
		- `.env` files (key=value heuristics)
		- Dockerfiles (ENV/ARG heuristics)
	- 🟨 [IN PROGRESS 2025-08-26] Added opt-in binary scanner (`SENTINEL_SCAN_BINARIES=true`) for small files (<= 2 MiB), naive UTF-8 decode.
	- Remaining: selective binary scanning improvements, additional formats (e.g., .7z), and content-type sniffing.

5. Add Jupyter Notebook extension (nbextension) to scan notebook cells client-side and surface findings in the UI.
	- 🟨 [IN PROGRESS 2025-08-26] Minimal classic Notebook extension scaffolded under `examples/nbext/` with toolbar scan button and findings dialog.
6. Add analytics/dashboarding exporter (Prometheus metrics + optional Grafana dashboards).

## Nice-to-have / Wish list

1. Add a Git pre-commit hook installer that runs the scanner on staged files (fast path) and blocks commits that match high-severity rules.
2. Add VS Code extension for inline secret finding and quick rotate suggestions.
3. Add an API server mode for remote scanning and rotator orchestration (requires auth and RBAC).
4. Add a web UI for triaging findings and delegating rotations to teams.
5. Add language-specific detectors and false-positive suppression heuristics.

---
