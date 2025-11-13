# Migration Guide

This guide helps you migrate between major versions of SecretSentinel Scanner & Rotator.

## Table of Contents

- [Migrating to v0.3.0 (Unreleased)](#migrating-to-v030-unreleased)
- [Migrating to v0.2.0](#migrating-to-v020)
- [General Migration Tips](#general-migration-tips)

---

## Migrating to v0.3.0 (Unreleased)

### New Features

#### 1. Package Publishing & Installation

**Before:**
```powershell
# Clone and build from source
git clone https://github.com/sirhCC/Sentinel-ScannerRotator.git
cd Sentinel-ScannerRotator
npm install
npm run build
npm start -- scan .
```

**After:**
```powershell
# Install globally from npm
npm install -g secret-sentinel-scanner-rotator

# Use CLI directly
sentinel scan .
```

**Migration Steps:**
1. Uninstall local clone if desired
2. Install global package: `npm install -g secret-sentinel-scanner-rotator`
3. Update scripts to use `sentinel` instead of `npm start --`
4. Update CI/CD pipelines to install from npm

#### 2. Error Handling & Retry Logic

**Impact:** Network operations now automatically retry on transient failures.

**Before:**
```typescript
// Custom rotator - single attempt
export default defineRotator({
  name: 'my-vault',
  async rotate(finding) {
    await fetch('https://vault.example.com/secrets', {
      method: 'POST',
      body: JSON.stringify({ secret: finding.match }),
    });
  },
});
```

**After:**
```typescript
// Custom rotator - with built-in retry
import { withRetry } from '../src/errorHandling.js';

export default defineRotator({
  name: 'my-vault',
  async rotate(finding) {
    await withRetry(async () => {
      const response = await fetch('https://vault.example.com/secrets', {
        method: 'POST',
        body: JSON.stringify({ secret: finding.match }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    });
  },
});
```

**Migration Steps:**
1. Import error handling utilities: `import { withRetry, maskError } from '../src/errorHandling.js'`
2. Wrap network calls with `withRetry()` for automatic retry
3. Use `maskError()` before logging errors containing secrets
4. No action needed for built-in rotators (already updated)

#### 3. Cache Corruption Recovery

**Impact:** Cache files are now validated and automatically recovered.

**Before:**
- Corrupted cache required manual deletion
- Empty cache files caused errors
- No automatic backup

**After:**
- Automatic validation on load
- Corrupted caches backed up to `.corrupted.<timestamp>` files
- Automatic recovery with fresh cache
- Atomic writes prevent corruption

**Migration Steps:**
1. No code changes required
2. Old cache files are automatically upgraded from v1 to v2
3. Consider clearing cache if experiencing issues: `rm .sentinel_cache.json`

#### 4. Secret Masking in Logs

**Impact:** Secrets are now automatically masked in error messages and logs.

**Before:**
```
Error: Failed to store AWS key AKIAIOSFODNN7EXAMPLE in vault
```

**After:**
```
Error: Failed to store AWS key ***REDACTED*** in vault
```

**Migration Steps:**
1. No action required - automatic for all logs
2. For custom logging, use `maskError()` utility:
   ```typescript
   import { maskError } from '../src/errorHandling.js';
   
   try {
     await operation();
   } catch (err) {
     const masked = maskError(err as Error);
     console.error(masked.message); // Secrets masked
   }
   ```

---

## Migrating to v0.2.0

### Breaking Changes

#### 1. Minimum Severity Filtering

**Impact:** `--min-severity` now filters counts BEFORE threshold checks.

**Before (v0.1.x):**
```powershell
# All findings counted, then filtered for display
sentinel --fail-threshold 5 --min-severity high
```

**After (v0.2.0):**
```powershell
# Only high-severity findings counted toward threshold
sentinel --fail-threshold 5 --min-severity high
```

**Migration Steps:**
1. Review threshold values if using `--min-severity`
2. Adjust thresholds to account for filtered counts
3. Use severity-specific thresholds for finer control:
   ```powershell
   sentinel --fail-threshold-high 0 --fail-threshold-medium 5
   ```

#### 2. Policy Precedence

**Impact:** CLI flags now override policy file settings.

**Before (v0.1.x):**
- Policy file settings took precedence
- CLI flags were ignored if policy existed

**After (v0.2.0):**
- CLI flags override policy settings
- Precedence: CLI > Policy > Defaults

**Example:**

Policy file (`.secretsentinel.json`):
```json
{
  "failThreshold": 10,
  "minSeverity": "low"
}
```

Command:
```powershell
sentinel --fail-threshold 5 --min-severity high
```

Result:
- Threshold: 5 (from CLI, not 10 from policy)
- Min severity: high (from CLI, not low from policy)

**Migration Steps:**
1. Review policy files for conflicts with CLI usage
2. Move environment-specific settings to CLI flags
3. Keep common defaults in policy files

#### 3. Cache Mode

**Impact:** New `SENTINEL_CACHE_MODE=hash` option for content-based caching.

**Before (v0.1.x):**
```powershell
# Only mtime/size-based caching
sentinel --cache .sentinel_cache.json
```

**After (v0.2.0):**
```powershell
# Hash-based caching for more accuracy
export SENTINEL_CACHE_MODE=hash
sentinel --cache .sentinel_cache.json
```

**Migration Steps:**
1. Old cache files work without changes
2. Set `SENTINEL_CACHE_MODE=hash` for content-based caching
3. Clear cache after switching modes: `rm .sentinel_cache.json`

#### 4. Worker Thread Pool

**Impact:** Optional worker threads for parallel scanning.

**Before (v0.1.x):**
- Single-threaded scanning

**After (v0.2.0):**
```powershell
# Enable worker threads (requires built artifacts)
export SENTINEL_WORKERS=4
sentinel scan .
```

**Migration Steps:**
1. Build project: `npm run build`
2. Set `SENTINEL_WORKERS=<n>` to enable
3. Auto-disabled in tests (no test changes needed)

### New Features (Non-Breaking)

#### 1. Archive Guardrails

Protection against zip-bombs:

```powershell
# Default limits applied automatically
sentinel scan ./archives/
```

Customize limits via environment:
```powershell
export SENTINEL_MAX_ARCHIVE_ENTRIES=10000
export SENTINEL_MAX_ARCHIVE_ENTRY_SIZE=104857600  # 100MB
export SENTINEL_MAX_ARCHIVE_TOTAL=1073741824      # 1GB
```

#### 2. RE2 Regex Engine

Safe regex engine for untrusted patterns:

```powershell
export SENTINEL_REGEX_ENGINE=re2
sentinel --rulesets-install untrusted-rules
```

#### 3. Streaming Scans

Automatic for large files (reduces memory usage).

---

## General Migration Tips

### 1. Test Before Production

Always test migrations in a non-production environment:

```powershell
# Test scan without rotation
sentinel --dry-run --log-level debug scan ./test-repo

# Review findings
cat findings.json

# Test with rotation
sentinel --rotator apply --dry-run scan ./test-repo
```

### 2. Backup Configuration

Before migrating, backup your configuration:

```powershell
# Backup config
cp .secretsentinel.json .secretsentinel.json.backup

# Backup cache
cp .sentinel_cache.json .sentinel_cache.json.backup

# Backup custom rotators
tar -czf rotators-backup.tar.gz ./rotators/
```

### 3. Update Dependencies

Ensure dependencies are up to date:

```powershell
# Update project dependencies
npm update

# Check for security vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

### 4. Review Breaking Changes

Check changelog for breaking changes:

```powershell
# View changelog
cat CHANGELOG.md

# Check specific version
grep -A 20 "\[0.2.0\]" CHANGELOG.md
```

### 5. Update CI/CD Pipelines

Update pipeline configurations:

**GitHub Actions (before):**
```yaml
- name: Clone and build
  run: |
    git clone https://github.com/sirhCC/Sentinel-ScannerRotator.git
    cd Sentinel-ScannerRotator
    npm install
    npm run build
    npm start -- scan .
```

**GitHub Actions (after):**
```yaml
- name: Install SecretSentinel
  run: npm install -g secret-sentinel-scanner-rotator

- name: Scan for secrets
  run: sentinel --fail-on-findings scan .
```

### 6. Update Documentation

Update internal documentation and runbooks:

1. Update installation instructions
2. Update CLI command examples
3. Update troubleshooting guides
4. Update monitoring/alerting thresholds

### 7. Gradual Rollout

For large teams, consider gradual rollout:

1. **Week 1:** Test in development environment
2. **Week 2:** Deploy to staging with monitoring
3. **Week 3:** Deploy to 10% of production
4. **Week 4:** Full production rollout

### 8. Rollback Plan

Have a rollback plan ready:

```powershell
# Pin to specific version
npm install -g secret-sentinel-scanner-rotator@0.1.0

# Or revert to source installation
git clone -b v0.1.0 https://github.com/sirhCC/Sentinel-ScannerRotator.git
```

---

## Support

If you encounter migration issues:

1. **Check Documentation:** Review [README.md](./README.md) and [API.md](./API.md)
2. **Check Changelog:** Review [CHANGELOG.md](./CHANGELOG.md) for version-specific changes
3. **Search Issues:** Check [GitHub Issues](https://github.com/sirhCC/Sentinel-ScannerRotator/issues)
4. **Ask for Help:** Open a new issue with migration details
5. **Security Issues:** See [SECURITY.md](./SECURITY.md) for reporting

---

## Version Support Policy

- **Current Version:** Full support with security updates and bug fixes
- **Previous Version:** Security updates only
- **Older Versions:** No support, upgrade recommended

| Version | Support Status | End of Support |
|---------|---------------|----------------|
| 0.3.x   | ✅ Full Support | TBD |
| 0.2.x   | ⚠️ Security Only | 2026-09-07 |
| 0.1.x   | ❌ End of Life | 2025-09-07 |

---

## Deprecation Policy

Features are deprecated with at least one major version notice:

1. **Deprecation Notice:** Feature marked as deprecated in documentation
2. **Warning Period:** 1 major version with deprecation warnings
3. **Removal:** Feature removed in next major version

Example:
- v0.2.0: Feature X deprecated (warnings shown)
- v0.3.0: Feature X removed

---

## Questions?

For migration questions, please:
- Open a [GitHub Issue](https://github.com/sirhCC/Sentinel-ScannerRotator/issues)
- Review [API Documentation](./API.md)
- Check [Contributing Guide](./CONTRIBUTING.md)
