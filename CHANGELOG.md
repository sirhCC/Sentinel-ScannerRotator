# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Package Publishing Infrastructure** (#1)
  - npm package with global CLI commands: `sentinel` and `secret-sentinel`
  - GitHub Actions workflow for automated publishing to npm and GitHub Packages
  - Post-install verification script to validate installation
  - Comprehensive publishing guide (PUBLISHING.md)
  - npm lifecycle scripts: prepublishOnly, prepack, postinstall, version, postversion

- **Error Handling & Recovery** (#2)
  - Exponential backoff retry logic with jitter for network operations (3 retries, configurable delays)
  - Circuit breaker pattern to prevent cascading failures (5 failure threshold, 60s timeout)
  - Error masking for secrets in logs (AWS keys, GitHub tokens, JWTs, Stripe keys)
  - Cache corruption detection with automatic backup and recovery
  - Atomic cache writes using temp file + rename pattern
  - Timeout wrapper for long-running operations
  - Graceful degradation with fallback pattern
  - Safe JSON parsing with validation callback support

### Changed

- **AWS Secrets Manager Operations**: Added retry logic for ThrottlingException, ServiceUnavailable, network errors
- **Vault Operations**: Added retry logic for HTTP 429/500/502/503/504, network errors
- **Cache Loading**: Enhanced with validation, version upgrade (v1→v2), corruption recovery, empty file detection
- **Cache Saving**: Now uses atomic writes to prevent partial data corruption
- **Error Messages**: Improved to differentiate missing dependencies from misconfiguration

### Fixed

- Cache corruption no longer causes permanent scan failures - automatically detected and recovered
- Network timeouts and throttling now handled gracefully with exponential backoff
- Missing AWS SDK now shows helpful "npm install" message instead of cryptic errors

### Tests

- Added 26 comprehensive tests for error handling utilities (retry, circuit breaker, error masking, timeout)
- Added 13 tests for cache corruption recovery scenarios
- Total test suite: 119 tests passing (was 80 tests)

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
