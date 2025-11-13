<div align="center">

# 🛡️ SecretSentinel Scanner & Rotator

### **Intelligent Secret Detection & Rotation System**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](./LICENSE)

_A production-grade CLI tool for scanning repositories to detect secrets and safely rotating them through pluggable backends._

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Configuration](#%EF%B8%8F-configuration) • [API Reference](./API.md) • [Contributing](./CONTRIBUTING.md)

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔍 **Advanced Scanning**

- **Multi-format support** - Scan text files, archives (ZIP/TAR.GZ), `.env`, and Dockerfiles
- **Smart ignoring** - Respects `.gitignore`, `.secretignore`, and custom patterns
- **High-performance** - Concurrent scanning with worker thread pool support
- **ML integration** - Optional ML model hooks for enhanced detection
- **Entropy detection** - Flag high-entropy tokens (base64/hex patterns)

</td>
<td width="50%">

### 🔄 **Safe Rotation**

- **Atomic updates** - File changes with automatic backups & rollback
- **Multiple backends** - Local file, AWS Secrets Manager, HashiCorp Vault
- **Pluggable architecture** - Write custom rotators in TypeScript or JavaScript
- **Interactive mode** - Review and approve each change
- **Audit logging** - NDJSON event stream with HMAC signatures

</td>
</tr>
<tr>
<td width="50%">

### 📊 **Enterprise Ready**

- **CI/CD integration** - Fail pipelines based on findings thresholds
- **Metrics & monitoring** - Built-in Prometheus metrics HTTP server
- **Curated rulesets** - Marketplace with signed ruleset support
- **Policy enforcement** - Per-repository policy configurations
- **Export capabilities** - JSON/CSV output for findings

</td>
<td width="50%">

### ⚡ **Developer Experience**

- **Zero config start** - Works out of the box with sensible defaults
- **Flexible configuration** - JSON/YAML configs with Zod validation
- **Debug mode** - Comprehensive error logging with `SENTINEL_DEBUG`
- **Cache support** - Speed up repeated scans with persistent cache
- **Extensible** - Custom scanners, rotators, and rules

</td>
</tr>
</table>

---

## 📋 Requirements

- **Node.js** 18+ (recommended)
- **npm** (or yarn/pnpm)

## 🚀 Quick Start

### Installation

#### Option 1: Install from npm (Recommended)

```powershell
# Install globally
npm install -g secret-sentinel-scanner-rotator

# Verify installation
sentinel --version
sentinel --help
```

#### Option 2: Install from source

```powershell
# Clone the repository
git clone https://github.com/sirhCC/Sentinel-ScannerRotator.git
cd Sentinel-ScannerRotator

# Install dependencies
npm install

# Build the project
npm run build

# Test locally (without global install)
npm start -- . --rotator dry-run
```

### Basic Usage

#### If installed globally:

```powershell
# Scan a directory (dry-run mode - no changes)
sentinel ./my-project --rotator dry-run

# Scan with detailed output
sentinel ./my-project --rotator dry-run --log-level debug

# List available rotators
sentinel --list-rotators

# View runtime configuration
sentinel --show-runtime-info
```

#### If running from source:

```powershell
# Scan a directory (dry-run mode - no changes)
npm start -- ./my-project --rotator dry-run

# Scan with detailed output
npm start -- ./my-project --rotator dry-run --log-level debug

# List available rotators
npm start -- --list-rotators

# View runtime configuration
npm start -- --show-runtime-info
```

### First Scan Example

```powershell
# Scan current directory and report findings
npm start -- . --rotator dry-run

# Export findings to JSON
npm start -- . --rotator dry-run --out findings.json

# Enable debug mode for troubleshooting
$env:SENTINEL_DEBUG = "true"
npm start -- . --rotator dry-run
```

---

## 📖 Documentation

### CLI Reference

#### Help & Information

```powershell
npm start -- --help                  # Show all options
npm start -- --version               # Display version
npm start -- --list-rotators         # List available rotators
npm start -- --show-runtime-info     # Show runtime configuration
```

#### Core Options

| Option                  | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `-r, --rotator <name>`  | **Rotator to use:** `dry-run` \| `apply` \| `backend` |
| `-d, --dry-run`         | Report only; don't modify files                       |
| `-f, --force`           | Required to apply changes without dry-run             |
| `-I, --interactive`     | Approve each finding interactively                    |
| `-c, --config <path>`   | Path to config file or directory                      |
| `-i, --ignore <glob>`   | Add ignore pattern (repeatable)                       |
| `-l, --log-level <lvl>` | Set log level: `error` \| `warn` \| `info` \| `debug` |
| `-j, --log-json`        | Emit logs in JSON format                              |

#### Advanced Options

| Option                     | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `--scan-concurrency <n>`   | Concurrent file scans (default: 8)                             |
| `--rotate-concurrency <n>` | Concurrent rotations (default: 4)                              |
| `--cache <path>`           | Persist scan cache to file                                     |
| `--incremental`            | Enable incremental scanning (only scan git-changed files)      |
| `--no-incremental`         | Disable incremental scanning (default)                         |
| `--git-base <ref>`         | Git base ref for incremental (default: HEAD)                   |
| `--out <file>`             | Export findings (JSON/CSV based on extension)                  |
| `--out-format <fmt>`       | Override format: `json` \| `csv`                               |
| `--audit <path>`           | Write NDJSON audit log                                         |
| `-t, --template <tpl>`     | Replacement template (see [Template Tokens](#template-tokens)) |
| `--verify`                 | Verify backend read-back before updating files                 |

#### CI/CD Integration

| Option                        | Description                                   |
| ----------------------------- | --------------------------------------------- |
| `--fail-on-findings`          | Fail if findings exceed threshold             |
| `--fail-threshold <n>`        | Total findings threshold (default: 0)         |
| `--fail-threshold-high <n>`   | High severity threshold                       |
| `--fail-threshold-medium <n>` | Medium severity threshold                     |
| `--fail-threshold-low <n>`    | Low severity threshold                        |
| `--min-severity <lvl>`        | Minimum severity: `low` \| `medium` \| `high` |

#### Rulesets & Rules

| Option                    | Description                                |
| ------------------------- | ------------------------------------------ |
| `--list-rulesets`         | List available curated rulesets            |
| `--rulesets <names>`      | Enable specific rulesets (comma-separated) |
| `--rulesets-dirs <dirs>`  | Custom ruleset directories                 |
| `--disable-builtin-rules` | Disable built-in rule set                  |

#### Metrics & Monitoring

| Option               | Description                          |
| -------------------- | ------------------------------------ |
| `--metrics-server`   | Start Prometheus metrics HTTP server |
| `--metrics-port <n>` | Metrics server port (default: 9095)  |
| `--metrics <path>`   | Write metrics to file at end of run  |

#### Subcommands

```powershell
# Undo - restore file from backup
npm start -- undo ./path/to/file.txt
```

### Environment Variables

#### Core Settings

| Variable              | Description                         | Default         |
| --------------------- | ----------------------------------- | --------------- |
| `SENTINEL_DEBUG`      | Enable detailed debug logging       | `false`         |
| `SENTINEL_TMP_DIR`    | Backup/temp directory location      | `.sentinel_tmp` |
| `SENTINEL_CACHE`      | Persistent cache file path          | _none_          |
| `SENTINEL_CACHE_MODE` | Cache validation: `mtime` \| `hash` | `mtime`         |

#### Performance Features

**Incremental Scanning** - Speed up scans by only scanning files changed in git:

```powershell
# Enable incremental scanning (requires --cache and git repository)
npm start -- . --rotator dry-run --cache .cache.json --incremental

# Compare against specific git ref (e.g., main branch or tag)
npm start -- . --cache .cache.json --incremental --git-base main

# Disable incremental even when in git repo
npm start -- . --cache .cache.json --no-incremental
```

**How It Works:**

- Detects if you're in a git repository
- Uses `git diff` to identify changed, staged, and untracked files
- Only scans changed files while returning cached findings from unchanged files
- Preserves cache entries for unchanged files (no pruning in incremental mode)
- Falls back to full scan if not in git repo or no cache available

**Benefits:**

- **70-90% faster** on incremental changes
- Lower CPU usage in CI/CD pipelines
- Faster developer feedback loops
- Efficient for large monorepos

#### Performance Tuning

| Variable                      | Description                     | Default    |
| ----------------------------- | ------------------------------- | ---------- |
| `SENTINEL_SCAN_CONCURRENCY`   | Concurrent file scans           | `8`        |
| `SENTINEL_ROTATE_CONCURRENCY` | Concurrent rotations            | `4`        |
| `SENTINEL_WORKERS`            | Worker thread pool size         | _disabled_ |
| `SENTINEL_REGEX_ENGINE`       | Regex engine: `native` \| `re2` | `native`   |

#### Scanning Behavior

| Variable                     | Description                  | Default |
| ---------------------------- | ---------------------------- | ------- |
| `SENTINEL_SCAN_ARCHIVES`     | Scan ZIP/TAR.GZ files        | `true`  |
| `SENTINEL_SCAN_BINARIES`     | Scan binary files            | `false` |
| `SENTINEL_ENTROPY`           | Enable entropy detection     | `false` |
| `SENTINEL_ENTROPY_THRESHOLD` | Entropy bits/char threshold  | `3.5`   |
| `SENTINEL_ENTROPY_MINLEN`    | Min token length for entropy | `32`    |

#### Archive Limits

| Variable                       | Description             | Default  |
| ------------------------------ | ----------------------- | -------- |
| `SENTINEL_ZIP_MAX_ENTRIES`     | Max ZIP entries to scan | `1000`   |
| `SENTINEL_ZIP_MAX_ENTRY_BYTES` | Max ZIP entry size      | `1 MiB`  |
| `SENTINEL_ZIP_MAX_BYTES`       | Max total ZIP size      | `10 MiB` |
| `SENTINEL_TAR_MAX_ENTRIES`     | Max TAR entries to scan | `1000`   |
| `SENTINEL_TAR_MAX_ENTRY_BYTES` | Max TAR entry size      | `1 MiB`  |
| `SENTINEL_TAR_MAX_BYTES`       | Max total TAR size      | `10 MiB` |

#### ML Integration

| Variable             | Description                               | Default |
| -------------------- | ----------------------------------------- | ------- |
| `SENTINEL_ML_HOOK`   | Path to ML analysis module                | _none_  |
| `SENTINEL_ML_MODE`   | Analysis mode: `line` \| `file` \| `both` | `line`  |
| `SENTINEL_ML_MAX_MS` | ML timeout per call (ms)                  | _none_  |

#### Backend Configuration

| Variable                  | Description                         | Default                  |
| ------------------------- | ----------------------------------- | ------------------------ |
| `SENTINEL_BACKEND`        | Backend: `file` \| `aws` \| `vault` | `file`                   |
| `SENTINEL_BACKEND_FILE`   | File backend JSON path              | `.sentinel_secrets.json` |
| `SENTINEL_BACKEND_PREFIX` | AWS secret name prefix              | _none_                   |
| `SENTINEL_VAULT_MOUNT`    | Vault KV mount point                | `secret`                 |
| `SENTINEL_VAULT_PATH`     | Vault secret path                   | `sentinel`               |

### Exit Codes

| Code | Meaning                                            |
| ---- | -------------------------------------------------- |
| `0`  | Success                                            |
| `2`  | Unknown rotator                                    |
| `3`  | Unsafe apply invocation (missing `--force`)        |
| `4`  | Failed due to findings (with `--fail-on-findings`) |

---

## 💡 Usage Examples

### Scanning & Detection

```powershell
# Basic scan with dry-run
npm start -- ./my-repo --rotator dry-run

# Scan with custom ignore patterns
npm start -- ./my-repo --rotator dry-run --ignore "*.log" --ignore "node_modules/**"

# Enable entropy detection for high-entropy tokens
$env:SENTINEL_ENTROPY = "true"
npm start -- ./my-repo --rotator dry-run

# Scan with specific rulesets
npm start -- ./my-repo --rotator dry-run --rulesets "common,cloud,crypto"

# Export findings to different formats
npm start -- ./my-repo --rotator dry-run --out findings.json
npm start -- ./my-repo --rotator dry-run --out findings.csv
```

### Rotation & Secret Management

```powershell
# Apply rotation with template (creates backups)
npm start -- . --rotator apply --force --template "__MASKED_{{timestamp}}__"

# Interactive approval for each finding
npm start -- . --rotator apply --interactive --audit audit.ndjson

# Backend rotation (file provider)
$env:SENTINEL_BACKEND = "file"
$env:SENTINEL_BACKEND_FILE = ".sentinel_secrets.json"
npm start -- . --rotator backend --force --verify

# Backend rotation (AWS Secrets Manager)
$env:SENTINEL_BACKEND = "aws"
$env:AWS_REGION = "us-east-1"
npm start -- . --rotator backend --force --verify

# Backend rotation (HashiCorp Vault)
$env:SENTINEL_BACKEND = "vault"
$env:VAULT_ADDR = "http://127.0.0.1:8200"
$env:VAULT_TOKEN = "your-token"
npm start -- . --rotator backend --force --verify
```

### Rollback & Recovery

```powershell
# Undo changes to a specific file
npm start -- undo ./path/to/file.txt

# Use custom temp directory for isolation
$env:SENTINEL_TMP_DIR = ".sentinel_tmp_run1"
npm start -- . --rotator apply --force

# Clean up temp directory
Remove-Item -Recurse -Force ".sentinel_tmp_run1"
```

### CI/CD Integration

```powershell
# Fail pipeline if any secrets found
npm start -- . --rotator dry-run --fail-on-findings

# Allow up to 2 low-severity findings
npm start -- . --rotator dry-run --fail-on-findings --fail-threshold 2 --min-severity low

# Strict mode: zero high-severity findings allowed
npm start -- . --rotator dry-run --fail-on-findings --fail-threshold-high 0

# Export findings and fail on threshold
npm start -- . --rotator dry-run --fail-on-findings --out findings.json
```

### Performance Optimization

```powershell
# High-concurrency scanning
npm start -- . --rotator dry-run --scan-concurrency 16

# Enable persistent cache
npm start -- . --rotator dry-run --cache .sentinel_cache.json

# Use content hash for cache validation
$env:SENTINEL_CACHE_MODE = "hash"
npm start -- . --rotator dry-run --cache .sentinel_cache.json

# Enable worker thread pool
$env:SENTINEL_WORKERS = "4"
npm start -- . --rotator dry-run
```

### Monitoring & Metrics

```powershell
# Start with Prometheus metrics server
npm start -- . --rotator dry-run --metrics-server --metrics-port 9095

# Write metrics to file
npm start -- . --rotator dry-run --metrics metrics.txt

# In another terminal, query metrics
curl http://localhost:9095/metrics
curl http://localhost:9095/healthz
```

---

## ⚙️ Configuration

### Project Configuration Files

SecretSentinel looks for configuration files in the following locations (in order):

1. `.secretsentinel.yaml` (YAML format)
2. `.secretsentinel.json` (JSON format)
3. `config/defaults.json` (fallback)

#### Configuration Schema

**JSON Example (`.secretsentinel.json`):**

```json
{
  "patterns": [
    {
      "name": "MY_API_KEY",
      "regex": "MYAPI_[A-Z0-9]{16}",
      "severity": "high",
      "enabled": true
    },
    {
      "name": "Custom_Token",
      "regex": "tok_[a-f0-9]{32}",
      "severity": "medium"
    }
  ],
  "policy": {
    "thresholds": {
      "total": 0,
      "high": 0,
      "medium": 2,
      "low": 10
    },
    "forbidRules": ["AWS Access Key ID", "GitHub Personal Access Token"],
    "minSeverity": "medium"
  }
}
```

**YAML Example (`.secretsentinel.yaml`):**

```yaml
patterns:
  - name: MY_API_KEY
    regex: MYAPI_[A-Z0-9]{16}
    severity: high
    enabled: true

  - name: Custom_Token
    regex: tok_[a-f0-9]{32}
    severity: medium

policy:
  thresholds:
    total: 0
    high: 0
    medium: 2
    low: 10
  forbidRules:
    - AWS Access Key ID
    - GitHub Personal Access Token
  minSeverity: medium
```

### Configuration Validation

All configurations are validated using **Zod schemas** at load time:

#### Pattern Validation

- **`name`**: Must be a non-empty string
- **`regex`**: Must be a valid JavaScript regular expression
- **`severity`**: Must be `low`, `medium`, or `high` (optional)
- **`enabled`**: Must be boolean (optional, defaults to `true`)

#### Policy Validation

- **`thresholds`**: Must be non-negative integers (if specified)
- **`forbidRules`**: Must be an array of non-empty strings (if specified)
- **`minSeverity`**: Must be `low`, `medium`, or `high` (if specified)

Invalid configurations will fail fast with detailed error messages.

### Ignore Files

SecretSentinel respects gitignore-style patterns from:

- `.gitignore` (automatically detected)
- `.secretignore` (custom ignore file)
- CLI flags: `--ignore <pattern>` (repeatable)

**Example `.secretignore`:**

```gitignore
# Ignore test fixtures
test/fixtures/**

# Ignore generated files
dist/**
*.min.js

# Ignore documentation
docs/**
```

### Policy Configuration

Policy configurations guide CI/CD behavior when using `--fail-on-findings`:

- **`thresholds`**: Maximum allowed findings per severity level
- **`forbidRules`**: Rules that trigger immediate failure
- **`minSeverity`**: Minimum severity level to consider

**Precedence:** CLI flags > Policy config > Defaults

---

## 🔐 Rotators & Extensibility

### Built-in Rotators

| Rotator       | Description                              | Use Case                     |
| ------------- | ---------------------------------------- | ---------------------------- |
| **`dry-run`** | Report findings without modifications    | Safe scanning, reporting     |
| **`apply`**   | Replace matches using templates          | Masking secrets in place     |
| **`backend`** | Store in backend, replace with reference | Production secret management |

### Template Tokens

Use these tokens in `--template` for dynamic replacements:

| Token           | Description                      | Example Output                |
| --------------- | -------------------------------- | ----------------------------- |
| `{{match}}`     | The exact matched secret ⚠️      | `sk_live_abc123...`           |
| `{{timestamp}}` | Current timestamp (ms)           | `1699900800000`               |
| `{{file}}`      | File path containing match       | `src/config.ts`               |
| `{{ref}}`       | Backend reference (backend only) | `secretref://file/key_abc123` |

**Template Examples:**

```powershell
# Mask with timestamp
--template "__MASKED_{{timestamp}}__"

# Mask with file context
--template "__REDACTED_{{file}}_{{timestamp}}__"

# Backend reference (with backend rotator)
--template "{{ref}}"
```

### Custom Rotators

#### JavaScript Rotator

```javascript
// rotators/myRotator.js
export const myRotator = {
  name: 'my-custom-rotator',

  async rotate(finding, options) {
    // finding: { filePath, line, column, match, rule }
    // options: { dryRun, force, template, ... }

    console.log(`Processing ${finding.filePath}:${finding.line}`);

    return {
      success: true,
      message: `Rotated secret in ${finding.filePath}`,
    };
  },
};
```

#### TypeScript Rotator

```typescript
// rotators/myRotator.ts
import { defineRotator, Rotator } from '../../src/rotators/schema';

export const myRotator: Rotator = defineRotator({
  name: 'my-custom-rotator',

  async rotate(finding, options) {
    // Type-safe implementation
    return {
      success: true,
      message: `Rotated secret in ${finding.filePath}`,
    };
  },
});
```

#### Using Custom Rotators

```powershell
# Build project first
npm run build

# Run with custom rotator
npm start -- . --rotators-dir ./rotators --rotator my-custom-rotator --dry-run
```

---

## 🗄️ Backend Providers

### File Backend (Default)

Stores secrets in a local JSON file.

```powershell
$env:SENTINEL_BACKEND = "file"
$env:SENTINEL_BACKEND_FILE = ".sentinel_secrets.json"
npm start -- . --rotator backend --force --verify
```

**Output format (`.sentinel_secrets.json`):**

```json
{
  "key_abc123": {
    "value": "sk_live_actual_secret_here",
    "file": "src/config.ts",
    "line": 42,
    "timestamp": 1699900800000
  }
}
```

### AWS Secrets Manager

Requires `@aws-sdk/client-secrets-manager` package.

```powershell
# Install AWS SDK
npm install @aws-sdk/client-secrets-manager

# Configure
$env:SENTINEL_BACKEND = "aws"
$env:AWS_REGION = "us-east-1"
$env:SENTINEL_BACKEND_PREFIX = "myapp/"  # Optional prefix

npm start -- . --rotator backend --force --verify
```

### HashiCorp Vault

Uses Vault KV v2 engine via HTTP API.

```powershell
$env:SENTINEL_BACKEND = "vault"
$env:VAULT_ADDR = "http://127.0.0.1:8200"
$env:VAULT_TOKEN = "your-vault-token"

# Optional configuration
$env:SENTINEL_VAULT_MOUNT = "secret"      # Default: secret
$env:SENTINEL_VAULT_PATH = "sentinel"     # Default: sentinel
$env:VAULT_NAMESPACE = "myapp"            # Optional

npm start -- . --rotator backend --force --verify
```

---

## 📋 Audit Logging

### NDJSON Audit Trail

Enable append-only audit logging with `--audit <path>`:

```powershell
npm start -- . --rotator apply --interactive --audit audit.ndjson
```

**Event Format:**

```json
{
  "ts": 1699900800000,
  "file": "src/app.ts",
  "line": 10,
  "column": 15,
  "match": "API_KEY=secret123",
  "rule": "Generic API Key",
  "severity": "medium",
  "rotator": "apply",
  "dryRun": false,
  "verify": true,
  "success": true,
  "message": "updated src/app.ts",
  "hash": "sha256:abc123..."
}
```

### Signed Audit Logs

Add HMAC signatures for tamper-detection:

```powershell
$env:SENTINEL_AUDIT_SIGN_KEY = "your-secret-signing-key"
$env:SENTINEL_AUDIT_SIGN_KEY_ID = "key-2024-01"  # Optional

npm start -- . --rotator apply --audit audit.ndjson
```

Events will include:

- `hash`: SHA-256 hash of event payload
- `sig`: HMAC-SHA256 signature
- `keyId`: Key identifier (optional)

---

## 📊 Rules & Detection

### Built-in Rules

SecretSentinel includes production-ready detection rules:

| Rule              | Severity | Pattern                    |
| ----------------- | -------- | -------------------------- |
| AWS Access Key ID | High     | `AKIA[0-9A-Z]{16}`         |
| Generic API Key   | Medium   | Pattern matching `api_key` |
| JWT Token         | Low      | `eyJ[A-Za-z0-9-_]+...`     |
| Generic Secret    | Medium   | Pattern matching `secret`  |

### Entropy Detection

Detect high-entropy tokens (base64/hex patterns):

```powershell
$env:SENTINEL_ENTROPY = "true"
$env:SENTINEL_ENTROPY_THRESHOLD = "3.5"  # bits/char
$env:SENTINEL_ENTROPY_MINLEN = "32"      # minimum length
npm start -- . --rotator dry-run
```

### Curated Rulesets & Marketplace

```powershell
# List available rulesets
npm start -- --list-rulesets

# Enable specific rulesets
npm start -- . --rotator dry-run --rulesets "common,cloud,crypto"

# Use custom ruleset directories
npm start -- . --rotator dry-run --rulesets-dirs "./custom-rules"

# Disable built-in rules
npm start -- . --rotator dry-run --disable-builtin-rules
```

#### Signed Rulesets

Install and verify signed rulesets from a catalog:

```powershell
# Install from catalog
npm start -- --rulesets-catalog ./catalog.json --rulesets-install common,cloud

# Require signed rulesets
npm start -- --rulesets-catalog ./catalog.json --rulesets-install common `
  --rulesets-require-signed --rulesets-pubkey ./rules_pubkey.pem

# Require signed catalog
npm start -- --rulesets-catalog ./catalog.json --rulesets-install common `
  --rulesets-catalog-require-signed --rulesets-catalog-pubkey ./catalog_pubkey.pem
```

### ML Integration (Optional)

Integrate machine learning models for enhanced detection:

```powershell
# Enable ML hook
$env:SENTINEL_ML_HOOK = "./ml/custom-model.mjs"
$env:SENTINEL_ML_MODE = "both"           # line, file, or both
$env:SENTINEL_ML_MAX_MS = "1000"         # timeout per call

npm start -- . --rotator dry-run
```

**ML Module Interface:**

```javascript
// ml/custom-model.mjs
export function analyzeLine(line, { filePath, lineNumber }) {
  // Return array of findings
  return [
    {
      match: 'found_secret',
      column: 10,
      ruleName: 'ML-CustomModel',
    },
  ];
}

export function analyzeFile(lines, { filePath }) {
  // Whole-file analysis
  return [];
}
```

### Binary Scanning (Optional)

```powershell
$env:SENTINEL_SCAN_BINARIES = "true"  # Scan small binary files (<= 2 MiB)
npm start -- . --rotator dry-run
```

---

## 📈 Metrics & Monitoring

### Prometheus Metrics Server

Start an HTTP server exposing Prometheus metrics:

```powershell
npm start -- . --rotator dry-run --metrics-server --metrics-port 9095
```

**Endpoints:**

- `/healthz` - Health check endpoint
- `/metrics` - Prometheus metrics in text format

**Available Metrics:**

| Metric                                | Type    | Description                               |
| ------------------------------------- | ------- | ----------------------------------------- |
| `sentinel_findings_total`             | Counter | Total findings detected                   |
| `sentinel_findings_severity_total`    | Counter | Findings by severity (labels: `severity`) |
| `sentinel_rotations_total`            | Counter | Total rotation attempts                   |
| `sentinel_rotations_success_total`    | Counter | Successful rotations                      |
| `sentinel_rotations_failed_total`     | Counter | Failed rotations                          |
| `sentinel_rules_compiled_total`       | Gauge   | Number of compiled rules                  |
| `sentinel_files_skipped_total`        | Counter | Files skipped during scan                 |
| `sentinel_files_skipped_reason_total` | Counter | Skip reasons (labels: `reason`)           |
| `sentinel_ml_invocations_total`       | Counter | ML hook invocations                       |
| `sentinel_ml_time_ms_total`           | Counter | Total ML processing time                  |
| `sentinel_ml_errors_total`            | Counter | ML hook errors                            |
| `sentinel_runtime_info`               | Gauge   | Runtime configuration info                |

**Prometheus Query Examples:**

```promql
# Current runtime configurations
sentinel_runtime_info

# Group by engine and worker count
sum by (engine, workers) (sentinel_runtime_info)

# Findings rate
rate(sentinel_findings_total[5m])

# Success rate
rate(sentinel_rotations_success_total[5m]) / rate(sentinel_rotations_total[5m])
```

### File-based Metrics

Export metrics to a file:

```powershell
npm start -- . --rotator dry-run --metrics ./metrics.txt
```

---

## 🛡️ Security

### Safety Features

- **Atomic file updates** with automatic backups
- **Rollback support** via `undo` subcommand
- **Dry-run mode** for safe testing
- **Interactive approval** for manual verification
- **Audit logging** with cryptographic signatures

### Backup & Recovery

All modifications create backups in `.sentinel_tmp`:

```powershell
# Custom temp directory
$env:SENTINEL_TMP_DIR = ".sentinel_backup"
npm start -- . --rotator apply --force

# Undo changes to a specific file
npm start -- undo ./path/to/file.txt

# Clean up backups
Remove-Item -Recurse -Force ".sentinel_tmp"
```

### Interactive Mode

Approve each change manually:

```powershell
npm start -- . --rotator apply --interactive
```

**Automated Testing:**

```powershell
# Auto-approve all prompts
$env:SENTINEL_INTERACTIVE_AUTO = "yes"

# Auto-deny all prompts
$env:SENTINEL_INTERACTIVE_AUTO = "no"
```

### Threat Model

See `SECURITY.md` for:

- Threat model and attack vectors
- Operational security guidelines
- Incident response procedures
- Vulnerability reporting process

---

## 🚀 Development

### Build & Test

```powershell
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests (80+ test suite)
npm test

# Run linter
npm run lint

# Format code
npm run format

# Development mode (auto-rebuild)
npm run dev -- . --rotator dry-run
```

### Project Structure

```plaintext
src/
  ├── cli.ts              # CLI entry point
  ├── scanner.ts          # Core scanning engine
  ├── config.ts           # Configuration loader
  ├── policy.ts           # Policy enforcement
  ├── rotators/           # Rotator implementations
  ├── rules/              # Detection rules
  ├── plugins/            # Scanner plugins
  └── worker/             # Worker thread pool

test/                     # 80+ tests
config/                   # Default configurations
examples/                 # Usage examples
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('Custom Feature', () => {
  it('should detect secrets', async () => {
    // Test implementation
    expect(result).toBeDefined();
  });
});
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run `npm test` and `npm run lint`
6. Submit a pull request

---

## 🔌 Extensions

### Jupyter Notebook Extension

A client-side secret scanner for Jupyter notebooks:

```powershell
# See examples/nbext/README.md for installation
jupyter nbextension install examples/nbext/sentinelscan
jupyter nbextension enable sentinelscan/main
```

Features:

- Toolbar button for on-demand scanning
- Highlights cells with potential secrets
- No server-side dependencies

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

---

## 📚 Additional Resources

### Documentation

- **API Reference**: [API.md](./API.md) - Complete API documentation for plugin authors
- **Migration Guide**: [MIGRATION.md](./MIGRATION.md) - Version migration guides
- **Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md) - How to contribute to the project
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md) - Version history and release notes

### Security & Support

- **Security Policy**: [SECURITY.md](./SECURITY.md) - Reporting security vulnerabilities
- **Publishing Guide**: [PUBLISHING.md](./PUBLISHING.md) - Release and publishing process

### Development

- **Priority Tasks**: [PRIORITY_TASKS.md](./PRIORITY_TASKS.md) - Development roadmap
- **Examples**: `examples/` directory - Working code examples
  - `examples/rotators/` - Custom rotator examples
  - `examples/ml/` - ML integration examples
  - `examples/nbext/` - Jupyter Notebook extension

### Performance & Benchmarks

Run performance benchmarks to measure optimization impact:

```powershell
npm test -- performance.test.ts
```

**Key Performance Metrics:**

- **Cache Speedup**: 3-5x faster on repeated scans with unchanged files
- **Incremental Scan**: Scans only git-changed files (70-90% faster on typical changes)
- **Concurrency Scaling**: 2-4x speedup with 8 concurrent workers
- **Streaming**: Process 400k+ lines/second for large files
- **Cache Modes**: mtime (faster) vs hash (more accurate)

**Benchmark Results (100 files):**

- Full scan (no cache): ~60ms
- Full scan (cached): ~15ms (4x faster)
- Incremental scan (5% changed): Minimal overhead with git integration
- Concurrency 8 vs 1: 3-5x faster

---

## 🤝 Support

- **Issues**: [GitHub Issues](https://github.com/sirhCC/Sentinel-ScannerRotator/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sirhCC/Sentinel-ScannerRotator/discussions)

---

<div align="center">

**Made with ❤️ by [sirhCC](https://github.com/sirhCC)**

⭐ Star this project if you find it helpful!

</div>
