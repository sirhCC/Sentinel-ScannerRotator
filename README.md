# SecretSentinel Scanner & Rotator

A TypeScript CLI that scans repositories for secret-like patterns and safely rotates them via pluggable rotators.

• Fast recursive scanning with ignore support (.gitignore/.secretignore and CLI globs)
• ZIP archive scanning (scans text entries inside .zip files)
• TAR.GZ archive scanning (scans text entries inside .tar.gz/.tgz files)
• .env and Dockerfile-aware scanners (key=value, ENV/ARG heuristics)
• Safe, atomic file updates with backups and rollback
• Pluggable rotators: dry-run, apply, and backend (file/AWS/Vault)
• Interactive approval and optional NDJSON audit logging
• Extensible configuration (JSON/YAML) and custom rotators

Requires Node.js 18+ (recommended) and npm.

## Quick start

1. Install dependencies

```powershell
npm install
```

1. Scan in dev mode (no changes)

```powershell
npm run dev -- <path-to-scan> --rotator dry-run
```

1. Build and run

```powershell
npm run build
npm start -- <path-to-scan> --rotator dry-run
```

## CLI overview

Help and version:

```powershell
npm start -- --help
npm start -- --version
```

Key options:

- `-r, --rotator <name>`: dry-run | apply | backend
- `-d, --dry-run`: report only; don't modify files
- `-f, --force`: required to apply without --dry-run
- `-i, --ignore <glob...>`: add ignore pattern(s) (repeatable)
- `-j, --log-json`: emit JSON logs
- `-l, --log-level <lvl>`: error | warn | info | debug
- `-c, --config <path>`: path to a config file or directory
- `-L, --list-rotators`: list available rotators and exit
- `-t, --template <tpl>`: replacement template (see tokens below)
- `--verify`: for backend rotator: read-back before updating files
- `-I, --interactive`: approve each finding interactively
- `--audit <path>`: write NDJSON audit events to a file
- `-x, --rotators-dir <dir...>`: discover additional rotators (repeatable)
- `--scan-concurrency <n>`: concurrent file scans (default 8 or SENTINEL_SCAN_CONCURRENCY)
- `--rotate-concurrency <n>`: concurrent rotations (default 4 or SENTINEL_ROTATE_CONCURRENCY)
- `--out <file>`: write scan findings (JSON or CSV; inferred from extension)
- `--out-format <fmt>`: json | csv (overrides extension inference)
- `--cache <path>`: persist scan cache to a file (or use SENTINEL_CACHE)
- `--fail-on-findings` and `--fail-threshold <n>`: fail fast for CI if findings exceed threshold (skips rotation)
- `--fail-threshold-high|--fail-threshold-medium|--fail-threshold-low <n>`: with `--fail-on-findings`, fail if per-severity counts exceed N
- `--min-severity <low|medium|high>`: only count findings at or above this severity when evaluating thresholds
- `--list-rulesets` | `--rulesets <names>` | `--rulesets-dirs <dirs>`: curated rulesets features
- `--metrics-server` | `--metrics-port <n>`: serve Prometheus metrics over HTTP (see Metrics section)
- `--disable-builtin-rules`: disable built-in rule set
- `--metrics <path>`: write Prometheus metrics at end of run
- `--issues` and `--issues-file <path>`: create issues (file provider) when failing on findings
  
Subcommands:

- `undo <file>`: restore the specified file from the most recent backup in `.sentinel_tmp` (or `SENTINEL_TMP_DIR`). Useful to roll back a previous apply.
  
Environment options:

- `SENTINEL_ENTROPY`: enable high-entropy token detection (`true`/`1`/`yes`).
- `SENTINEL_ENTROPY_THRESHOLD`: entropy threshold in bits/char (default 3.5)
- `SENTINEL_ENTROPY_MINLEN`: minimum token length to consider (default 32)
- `SENTINEL_REGEX_ENGINE`: optional regex engine; `native` (default) or `re2`. When set to `re2` and the `re2` package is available, patterns compile with RE2 for safer backtracking. If `re2` isn’t installed or a specific pattern isn’t supported, the scanner falls back to native `RegExp` per rule.
- `SENTINEL_WORKERS`: optional worker pool size for scanning with worker_threads (e.g., `4`). Disabled during tests by default. Requires built artifacts (`npm run build`) so the pool can load `dist/worker/scanWorker.js`.

Exit codes: 0 success; 2 unknown rotator; 3 unsafe apply invocation; 4 failed due to findings (with --fail-on-findings).

## Examples

List rotators:

```powershell
npm start -- --list-rotators
npm start -- --list-rotators --log-json
```

Apply with a template (dangerous; creates backups and supports rollback):

```powershell
npm start -- . --rotator apply --force --template "__MASKED_{{timestamp}}__"
```

Undo the last change on a single file:


```powershell
npm start -- undo .\path\to\file.txt
```

Interactive approval with audit log:

```powershell
npm start -- . --rotator apply --interactive --audit .\audit.ndjson
```

Backend rotation with verification (file provider):

```powershell
$env:SENTINEL_BACKEND = 'file'; $env:SENTINEL_BACKEND_FILE = '.sentinel_secrets.json'
npm start -- . --rotator backend --force --verify --template "{{ref}}"
```

Export findings to JSON or CSV:

```powershell
npm start -- . --rotator dry-run --out .\findings.json
npm start -- . --rotator dry-run --out .\findings.csv --out-format csv
```

Fail a CI step if findings are detected (threshold 0 by default):

```powershell
npm start -- . --rotator dry-run --fail-on-findings
# or allow up to N findings
npm start -- . --rotator dry-run --fail-on-findings --fail-threshold 2
```

## Safety: backups and temp directory

- Backups and temporary files live under `.sentinel_tmp` in the current working directory.
- Override with `SENTINEL_TMP_DIR` to isolate runs (useful in CI or parallel tests).
- `.sentinel_tmp/` is git-ignored.

Examples:

```powershell
$env:SENTINEL_TMP_DIR = ".sentinel_tmp_run1"; npm start -- . --rotator apply --force
Remove-Item -Recurse -Force ".sentinel_tmp_run1"
```

## Interactive mode

Use `--interactive` to approve each change. For automation/tests, set `SENTINEL_INTERACTIVE_AUTO` to `yes`/`no`/`true`/`false` to auto-approve or deny prompts.

## Audit logging (NDJSON)

Add `--audit <path>` to record an append-only NDJSON stream of events. Each line includes fields like:

```json
{
  "ts": 1712345678901,
  "file": "src/app.ts",
  "line": 10,
  "column": 15,
  "match": "API_KEY=...",
  "rotator": "apply",
  "dryRun": false,
  "verify": true,
  "success": true,
  "message": "updated src/app.ts"
}
```

Integrity: each event includes a SHA-256 `hash` of the payload. If `SENTINEL_AUDIT_SIGN_KEY` is set, an `hmac-sha256` signature (`sig`) and optional `keyId` (`SENTINEL_AUDIT_SIGN_KEY_ID`) are added.

## Template tokens

Supported tokens in `--template`:

- `{{match}}` — the exact matched secret (use with care)
- `{{timestamp}}` — `Date.now()` value
- `{{file}}` — the file path with the match
- `{{ref}}` — with `backend` rotator: the generated reference (e.g., `secretref://file/<key>`)

Examples:

```powershell
# Safer masking (timestamp + file path)
npm start -- . --rotator apply --force --template "__MASKED_{{file}}_{{timestamp}}__"

# Echo original match (not recommended unless you scrub later)
npm start -- . --rotator apply --force --template "__REDACTED_{{match}}__"
```

## Configuration

A project-level configuration customizes detection patterns. The loader prefers a root config file in the scanned repo, falling back to `config/defaults.json`.

Supported filenames (repo root):

- `.secretsentinel.yaml` (YAML)
- `.secretsentinel.json` (JSON)

Example JSON (`.secretsentinel.json`):

```json
{
  "patterns": [
    { "name": "MY_API_KEY", "regex": "MYAPI_[A-Z0-9]{16}", "severity": "high" }
  ]
}
```

Example YAML (`.secretsentinel.yaml`):

```yaml
patterns:
  - name: MY_API_KEY
    regex: MYAPI_[A-Z0-9]{16}
```

Notes:

- If `js-yaml` isn’t installed, YAML parsing is skipped; JSON/defaults are used.
- `--config <path>` can point at a file or directory; if a file, its directory is used as the base for lookup.

## Ignore rules

The scanner respects patterns from `.gitignore` and `.secretignore` in the scan root. You can supplement with `--ignore <glob>` (repeatable).

## Rotators and extensibility

Built-in rotators:

- `dry-run` — report what would change
- `apply` — replace matches in files using a template
- `backend` — store secrets in a backend and replace with a portable reference

Discover custom rotators from additional directories with `--rotators-dir <dir>`.

Authoring a rotator (JS):

```js
// plugins/rotators/myRotator.js
export const myRotator = {
  name: 'my-rotator',
  async rotate(finding, options) {
    return { success: true, message: `handled ${finding.filePath}:${finding.line}` };
  }
};
```

Authoring a rotator (TS):

```ts
// plugins/rotators/myRotator.ts
import { defineRotator, Rotator } from '../../src/rotators/schema';

export const myRotator: Rotator = defineRotator({
  name: 'my-rotator',
  async rotate(finding, options) {
    return { success: true, message: `handled ${finding.filePath}:${finding.line}` };
  },
});
```

Run with your rotator directory:

```powershell
npm run build
npm start -- . --rotators-dir .\plugins\rotators --rotator my-rotator --dry-run
```

## Backend rotator

The `backend` rotator stores the matched secret and replaces it with a reference like `secretref://<provider>/<key>`.

Providers:

- file (default): JSON map in `.sentinel_secrets.json` (override with `SENTINEL_BACKEND_FILE`).
- aws (optional): AWS Secrets Manager (install `@aws-sdk/client-secrets-manager`; set `AWS_REGION` or `AWS_DEFAULT_REGION`).
- vault (optional): HashiCorp Vault KV v2 via HTTP (uses global `fetch`). Requires `VAULT_ADDR` and `VAULT_TOKEN`. Optional `SENTINEL_VAULT_MOUNT` (default `secret`) and `SENTINEL_VAULT_PATH` (default `sentinel`). Supports `VAULT_NAMESPACE`.

Environment variables:

- `SENTINEL_BACKEND` — `file` (default), `aws`, or `vault`.
- `SENTINEL_BACKEND_FILE` — JSON secrets file path for file backend.
- `SENTINEL_BACKEND_PREFIX` — optional AWS secret name prefix.

Examples:

```powershell
# File backend (default)
$env:SENTINEL_BACKEND = 'file'; $env:SENTINEL_BACKEND_FILE = '.sentinel_secrets.json'
npm start -- . --rotator backend --force

# AWS Secrets Manager (requires SDK and AWS creds/region)
# npm install @aws-sdk/client-secrets-manager
$env:SENTINEL_BACKEND = 'aws'; $env:AWS_REGION = 'us-east-1'
npm start -- . --rotator backend --force

# HashiCorp Vault (KV v2)
$env:SENTINEL_BACKEND = 'vault'; $env:VAULT_ADDR = 'http://127.0.0.1:8200'; $env:VAULT_TOKEN = '<token>'
# optional: $env:SENTINEL_VAULT_MOUNT = 'secret'; $env:SENTINEL_VAULT_PATH = 'sentinel'; $env:VAULT_NAMESPACE = 'myns'
npm start -- . --rotator backend --force
```

Verification: add `--verify` to read back the stored value before modifying files.

## Performance: concurrency, caching, and throttling

- Scanning uses a worker pool. Configure with `--scan-concurrency <n>` or `SENTINEL_SCAN_CONCURRENCY`.
- Rotations run concurrently but never edit the same file in parallel. Configure with `--rotate-concurrency <n>` or `SENTINEL_ROTATE_CONCURRENCY`.
- Speed up repeated scans by enabling a persistent scan cache: `--cache <file>` or `SENTINEL_CACHE`.
- Archive scanning:
  - Toggle on/off for all archives with `SENTINEL_SCAN_ARCHIVES` ("false"/"0"/"no" disables).
  - ZIP guardrails: `SENTINEL_ZIP_MAX_ENTRIES` (default 1000), `SENTINEL_ZIP_MAX_ENTRY_BYTES` (default 1 MiB), `SENTINEL_ZIP_MAX_BYTES` (default 10 MiB).
  - TAR.GZ guardrails: `SENTINEL_TAR_MAX_ENTRIES` (default 1000), `SENTINEL_TAR_MAX_ENTRY_BYTES` (default 1 MiB), `SENTINEL_TAR_MAX_BYTES` (default 10 MiB).
- Cache modes: set `SENTINEL_CACHE_MODE=hash` to validate cache hits by SHA-256 content hash (default `mtime` uses mtime+size).
- Optional worker pool: set `SENTINEL_WORKERS=<n>` to offload scanning to worker threads. This can improve throughput on CPU-bound regex scans. The pool is ignored if the worker file isn’t built or when running tests.

Example (PowerShell):

```powershell
npm start -- . --rotator dry-run --scan-concurrency 16 --rotate-concurrency 8 --cache .\.sentinel\cache.json
```

Use stronger cache validation:

```powershell
$env:SENTINEL_CACHE_MODE = 'hash'; npm start -- . --rotator dry-run --cache .\.sentinel\cache.json
```

## Rules, severities, and entropy

- Rules come from built-ins plus project config. Built-ins include AWS Access Key ID (high), a generic API key pattern (medium), and JWT-like strings (low).
- Custom rules can be added via `.secretsentinel.json`/`.secretsentinel.yaml` using the existing `patterns` array; optional fields `severity` (low|medium|high) and `enabled: false` are supported.
- Findings include `rule` and `severity` when available. Exports (JSON/CSV) include these fields.
- Opt-in entropy detector: set `SENTINEL_ENTROPY=true` to flag high-entropy tokens (base64/hex-like) above a threshold. Future flags may allow tuning the threshold.

### Curated rulesets and marketplace

- List curated rulesets: `npm start -- --list-rulesets`.
- Enable curated rulesets: `--rulesets "common,cloud"` or `SENTINEL_RULESETS`.
- Discover external rulesets from directories with `--rulesets-dirs ".\\curated;C:\\more"` (files named `*.ruleset.json`).
- Disable built-ins with `--disable-builtin-rules` or `SENTINEL_DISABLE_BUILTIN_RULES=true`.

Install from a catalog and enforce signatures:

```powershell
# Install from a catalog into cache dir
sentinel --rulesets-catalog .\catalog.json --rulesets-install common,cloud --rulesets-cache-dir .\.sentinel_rulesets

# Require signed rulesets using a PEM public key (file or inline content)
sentinel --rulesets-catalog .\catalog.json --rulesets-install common \
  --rulesets-require-signed --rulesets-pubkey .\rules_pubkey.pem

# Require the catalog itself to be signed via a detached .sig file
sentinel --rulesets-catalog .\catalog.json --rulesets-install common \
  --rulesets-catalog-require-signed --rulesets-catalog-pubkey .\catalog_pubkey.pem
```

### ML model hook (optional)

- Provide `SENTINEL_ML_HOOK` path or spec to a module exporting `analyzeLine(line, {filePath, lineNumber})` returning tokens.
- Findings from ML are tagged as `ML-Hook` unless `ruleName` is set.

### Binary scanning (optional)

- Enable with `SENTINEL_SCAN_BINARIES=true`; scans small binary files (<= 2 MiB) by decoding to UTF-8 and applying rules.

## Metrics HTTP server

Expose Prometheus metrics and a simple health check over HTTP.

- Start the server: pass `--metrics-server` (default port 9095) or additionally `--metrics-port <n>`.
- Endpoints:
  - `/healthz` returns 200 OK and the text "ok".
  - `/metrics` returns Prometheus format metrics like:
    - `sentinel_findings_total`
    - `sentinel_findings_severity_total{severity="low|medium|high"}`
    - `sentinel_rotations_total`, `sentinel_rotations_success_total`, `sentinel_rotations_failed_total`
    - `sentinel_rules_compiled_total`
    - `sentinel_files_skipped_total`
    - `sentinel_files_skipped_reason_total{reason="..."}`
    - `sentinel_runtime_info{engine=...,workers=...,cache_mode=...,scan_concurrency=...,rotate_concurrency=...,version=...} 1`

You can still write metrics to a file at the end of the run with `--metrics <path>`.

### Policy (optional)

You can add a `policy` block in `.secretsentinel.json`/`.secretsentinel.yaml` (or `config/defaults.json`) to guide CI gating when using `--fail-on-findings`:

Example JSON:

```json
{
  "policy": {
    "thresholds": { "total": 0, "high": 0, "medium": 2, "low": 10 },
    "forbidRules": ["AWS Access Key ID"],
    "minSeverity": "medium"
  }
}
```

Semantics and precedence:

- `minSeverity`: findings are filtered to only those at or above this severity before threshold checks. For example, `minSeverity: "medium"` excludes low severity findings from threshold counting.
  - You can override this via CLI: `--min-severity <low|medium|high>`.
- Thresholds evaluation order: CLI flags have priority (e.g., `--fail-threshold`, `--fail-threshold-high|medium|low`), falling back to policy values, then defaults (total defaults to 0 when `--fail-on-findings` is used).
- `forbidRules`: if any listed rule matches, the run fails immediately when `--fail-on-findings` is set.
- Policy discovery is rooted at the scan target (or `--config` path if provided). This lets per-repo policies travel with the scanned project.

CLI flags override the policy thresholds when provided.

## Development

Build, test, lint, and format:

```powershell
npm run build
npm test
npm run lint
npm run format
```

Run locally (dev):

```powershell
npm run dev -- . --rotator dry-run
```

## Jupyter Notebook extension (example)

A minimal classic Notebook nbextension lives in `examples/nbext/`. It adds a toolbar button that scans cells for common secret patterns client-side and shows findings. See `examples/nbext/README.md` for install instructions.

## Security and safety

- This tool can modify files when not in `--dry-run`. Prefer dry-runs first and require `--force` (or `--interactive`).
- Review `SECURITY.md` for threat model and operational guidance.

## License

MIT License. See `LICENSE`.


