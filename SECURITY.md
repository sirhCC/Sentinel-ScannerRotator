# Security policy

## Reporting vulnerabilities

Please report suspected vulnerabilities privately using GitHub’s security advisories for this repository (preferred). Include:

- A clear description of the issue and impact
- Steps to reproduce (PoC if possible)
- Affected versions/commit(s) and environment

Avoid posting sensitive details in public issues. We’ll acknowledge and work with you on a coordinated disclosure.

## Safe usage guidelines

- Prefer `--dry-run` first. Validate findings and planned changes before applying.
- To modify files, require an explicit choice: `--force` or `--interactive`.
- Use conservative templates. Avoid echoing `{{match}}` in templates unless you understand the exposure.
- Scope scans. Use `.gitignore`, `.secretignore`, and `--ignore` to exclude build artifacts, large binaries, and archives.
- Back up your workspace. The tool makes backups for safety, but keep separate, trusted backups for production data.

## Backends and secret handling

- File backend: Stores secrets in plaintext JSON. Use only for development/testing. Ensure the path (e.g., `.sentinel_secrets.json`) is protected and git-ignored.
- AWS Secrets Manager: Prefer this or Vault for production. Use least-privilege IAM (create/update only for the configured path/prefix). Do not overgrant list/read unless required.
- HashiCorp Vault (KV v2): Use a dedicated mount/path and a minimal token scoped to write (and optional read for `--verify`). Support for `VAULT_NAMESPACE` is included.
- Use `--verify` with the backend rotator to read back the stored value before modifying files when the provider supports reads.

Environment variables (sensitive):

- `VAULT_TOKEN`, `VAULT_ADDR`, `VAULT_NAMESPACE` (optional)
- `AWS_REGION`/`AWS_DEFAULT_REGION` and AWS credentials
- `SENTINEL_BACKEND`, `SENTINEL_BACKEND_FILE`, `SENTINEL_BACKEND_PREFIX`

Never commit these or print them in logs. Use your platform’s secret store/CI masking.

## Audit logging

The `--audit <path>` option writes NDJSON logs that include details such as file path, location, rotator, and the matched `match` value. Treat audit logs as sensitive:

- Store audit files in restricted locations with appropriate ACLs.
- Rotate and securely delete when no longer needed.
- Do not commit audit artifacts to source control.

Note: Audit events are not signed or tamper-evident. If you require integrity guarantees, use an external signing process or append-only store (feature under consideration).

## Temporary files and backups

- All file updates are performed via an atomic safe-update routine that creates a backup and then replaces the original file.
- Backups and temp files are written under `.sentinel_tmp` in the current working directory, or at the directory set by `SENTINEL_TMP_DIR`.
- Backups contain the original content (including secrets). Protect and clean up the temp directory appropriately.
- The temp directory is ignored by git by default; verify your policies for CI and shared runners.

## Data handling and logging

- Dry-run output and some rotator messages can include the matched secret value (e.g., in dry-run). Use `--log-json` for structured logs and avoid templates that echo `{{match}}`.
- Be mindful when redirecting console output to files or CI artifacts; treat them as sensitive.

## Least privilege and operational posture

- Run with the minimum necessary OS and cloud permissions.
- Limit backend write scope (prefixes/paths) and avoid broad list/read where possible.
- In CI, pin the working directory, configure `SENTINEL_TMP_DIR` to an isolated path, and ensure cleanup after runs.

## Known limitations

- The scanner reads files as UTF‑8 text. It does not follow symlinks or scan inside archives; binary files may yield noisy results.
- It scans the working tree only; it does not analyze commit history or remote artifacts.
- File backend stores secrets unencrypted; prefer AWS Secrets Manager or Vault in production.
- Audit logs are plaintext NDJSON and may contain sensitive values.

## Contact

Use GitHub security advisories for private reports. For general questions, open a normal issue without sensitive details.
