# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2025-09-07

### Added

- CLI: `--min-severity <low|medium|high>` to filter findings before threshold counting (overrides policy).
- Policy semantics: `minSeverity` now filters counts used for thresholds; precedence is CLI > policy > defaults.
- Logging: when JSON logs are enabled, failing messages include `minSeverity` context when applicable.
- Optional RE2 regex engine via `SENTINEL_REGEX_ENGINE=re2` with safe per-rule fallback.
- Optional worker thread pool via `SENTINEL_WORKERS=<n>` (auto-disabled in tests; requires built artifacts).
- Streaming line-by-line scans for text-like files for lower memory footprint.
- Archive guardrails for ZIP/TAR (max entries, entry size, total bytes, global budget) to prevent zip-bombs.

### Changed

- Cache optimization: reuse computed content hash from scans when `SENTINEL_CACHE_MODE=hash` to avoid extra I/O.
- Batch per-file rotations when supported by rotator for fewer writes and better atomicity.
- Default policy discovery roots at the scan target (or `--config` path), improving per-repo behavior.

### Security/Safety

- Safer defaults: apply rotator requires `--dry-run` or `--force`; interactive approvals supported; backups and undo available.

### Tests

- Expanded test suite to cover policy semantics, CLI min severity, and guardrails; all tests pass.
