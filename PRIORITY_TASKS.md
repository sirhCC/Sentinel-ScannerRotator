# Priority work list — SecretSentinel-ScannerRotator

This file is a single, ordered list of work to do for the project. Highest priority items are at the top. Use this as the single source of truth and work sequentially from top to bottom unless blockers are reported.

---

## P0 — Immediate (blockers/security/critical correctness)

1. Make scanner recursive and respect ignore patterns (e.g., .gitignore) — implement fast, tested recursion with optional depth and a default ignore list. (Owner: TBD)
	- [DONE 2025-08-23] Implemented recursive scanning and `.gitignore` support; added `src/ignore.ts`, updated `src/scanner.ts`, and `test/scan-recursive.test.ts` (tests passing).
2. Add safe-file-update strategy for `apply` rotator: create per-file backup, atomic replace (write temp -> rename), and rollback on error. Critical for safety.
3. Add CLI flag `--dry-run` and ensure `--rotator apply` requires an explicit `--force` confirmation in non-interactive runs (or env var).
4. Harden regexes and allow configurable rules: move patterns to `config/defaults.json` with ability to load user config.
5. Add logging with levels (error, warn, info, debug) and structured JSON output option for automation/CI.
6. Add Node type support and fix any missing type errors (ensure `@types/node` is installed and tsconfig configured).
	- [DONE 2025-08-23] Added `@types/node` to devDependencies and resolved type issues needed to compile and run tests.
7. Add unit tests for core behaviors: recursive scanning, pattern matching, and safe apply; ensure CI can run tests headless.
	- [PARTIAL 2025-08-23] Added unit tests for scanner (`test/scanner.test.ts`) and recursive ignore behavior (`test/scan-recursive.test.ts`). Tests run headless via `vitest run`. Safe-apply tests still pending.
8. Add e2e test harness that runs against a temporary repo (creates files, runs scanner with both rotators, verifies outcomes).
9. Add license and security policy (SECURITY.md) and update README with clear warnings about `apply`.

## P1 — High (release-readiness features)

10. Implement ignore config parsing: support `.gitignore`, `.secretignore`, and CLI `--ignore` globs.
11. Add configuration file support (YAML/JSON) to allow customizing regexes, rotators, dry-run defaults, and exclude lists.
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
