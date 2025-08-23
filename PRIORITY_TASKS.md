# Priority work list — SecretSentinel-ScannerRotator

This file is a single, ordered list of work to do for the project. Highest priority items are at the top. Use this as the single source of truth and work sequentially from top to bottom unless blockers are reported.

---

## P0 — Immediate (blockers/security/critical correctness)

1. Make scanner recursive and respect ignore patterns (e.g., .gitignore) — implement fast, tested recursion with optional depth and a default ignore list. (Owner: TBD)
	- [DONE 2025-08-23] Implemented recursive scanning and `.gitignore` support; added `src/ignore.ts`, updated `src/scanner.ts`, and `test/scan-recursive.test.ts` (tests passing).
2. Add safe-file-update strategy for `apply` rotator: create per-file backup, atomic replace (write temp -> rename), and rollback on error. Critical for safety.
	- [DONE 2025-08-23] Implemented `src/fileSafeUpdate.ts`, updated `src/rotators/applyRotator.ts`, and added tests `test/apply-rotator.test.ts` to verify backup and rollback.
3. Add CLI flag `--dry-run` and ensure `--rotator apply` requires an explicit `--force` confirmation in non-interactive runs (or env var).
	- [DONE 2025-08-23] Implemented `runCli` in `src/index.ts`, added `--dry-run` and `--force` flags, and `test/cli.test.ts` to validate behavior.
4. Harden regexes and allow configurable rules: move patterns to `config/defaults.json` with ability to load user config.
	- [DONE 2025-08-23] Added `config/defaults.json`, `src/config.ts` loader, and updated `src/scanner.ts` to load patterns from config.
5. Add logging with levels (error, warn, info, debug) and structured JSON output option for automation/CI.
	- [DONE 2025-08-23] Added `src/logger.ts` with leveled logging and JSON output via `--log-json` and `--log-level` flags.
6. Add Node type support and fix any missing type errors (ensure `@types/node` is installed and tsconfig configured).
	- [DONE 2025-08-23] Added `@types/node` to devDependencies and resolved type issues needed to compile and run tests.
7. Add unit tests for core behaviors: recursive scanning, pattern matching, and safe apply; ensure CI can run tests headless.
	- [DONE 2025-08-23] Added unit tests for scanner, recursive ignore, config-based patterns, apply-rotator behavior, and a CLI test harness. Tests run headless via `vitest run`.
8. Add e2e test harness that runs against a temporary repo (creates files, runs scanner with both rotators, verifies outcomes).
	- [DONE 2025-08-23] Added `test/e2e.test.ts` which runs dry-run and apply against a temporary repo and verifies backups.
9. Add license and security policy (SECURITY.md) and update README with clear warnings about `apply`.
	- [DONE 2025-08-23] Added `LICENSE` (MIT), `SECURITY.md`, and README warning about `apply`.
	- [TODO]

## P1 — High (release-readiness features)

10. Implement ignore config parsing: support `.gitignore`, `.secretignore`, and CLI `--ignore` globs.
	- [DONE 2025-08-23] Implemented `src/ignore.ts`, CLI `--ignore` support, and tests `test/ignore.test.ts`.
11. Add configuration file support (YAML/JSON) to allow customizing regexes, rotators, dry-run defaults, and exclude lists.
	- [DONE 2025-08-23] Added runtime YAML/JSON loader in `src/config.ts` (supports `.secretsentinel.yaml` and `.secretsentinel.json`), added tests `test/config-file.test.ts`.
12. Improve `apply` rotator: support templated replacement or rotate to a secret manager (plugin points) rather than simple placeholder.
13. Add pluggable rotator interface and loader from `rotators/` directory (dynamic import), and doc for writing new rotators.
14. Add unit tests for rotator implementations, including failure modes (write permission errors, partial replacements).
15. Add comprehensive CLI help (`--help`) and validate flags with a parsing library (yargs/commander/zod for validation).
16. Add package scripts for linting and formatting and include ESLint + Prettier; enforce in CI.
17. Add proper CI pipeline (GitHub Actions): install, lint, build, test, security scan, and package step.

## P2 — Medium (integrations, UX, safety)

18. Rotator integrations: implement connectors for at least one secret backend (e.g., AWS Secrets Manager or Vault) as an example `apply` rotator.
19. Add interactive mode for review: show findings in an interactive TUI (fuzzy-select) to approve per-finding rotations.
20. Add permissions and dry-run audit logs: produce a signed audit artifact describing changes that would be made and what was changed when applied.
21. Add concurrent scanning and rotator throttling for performance on large repos (worker pool size, rate-limiting rotator calls).
22. Add an option to persist findings to an output format (JSON/CSV) for integrations with ticketing/alerting.
23. Add caching to avoid re-scanning unchanged files (file mtime + hash cache) to speed repeated runs.

## P3 — Lower priority (polish & enterprise features)

24. Add ruleset library and rule marketplace (curated regexes, entropy checks, ML model hook) — long-term.
25. Add policy engine to define allowed/forbidden patterns and auto-create issues in trackers when high-severity findings are found.
26. Add roll-forward and roll-back strategies for rotators integrated with external secret stores (i.e., ability to re-create secrets or rotate back to previous values).
27. Add scanning plugins for binary files and common artifact formats (Dockerfiles, environment files, zipped artifacts).
28. Add analytics/dashboarding exporter (Prometheus metrics + optional Grafana dashboards).

## Nice-to-have / Wish list

29. Add a Git pre-commit hook installer that runs the scanner on staged files (fast path) and blocks commits that match high-severity rules.
30. Add VS Code extension for inline secret finding and quick rotate suggestions.
31. Add an API server mode for remote scanning and rotator orchestration (requires auth and RBAC).
32. Add a web UI for triaging findings and delegating rotations to teams.
33. Add language-specific detectors and false-positive suppression heuristics.

---
