# SecretSentinel-ScannerRotator

A small TypeScript CLI that scans files for secret-like patterns and supports pluggable rotators (dry-run/apply).

Quick start

1. Install dependencies

```powershell
npm install
```

2. Run in dev mode

```powershell
npm run dev -- <path-to-scan> --rotator dry-run
```

3. Build & run

```powershell
npm run build
npm start -- <path-to-scan> --rotator dry-run
```

API

- `src/scanner.ts` - scanner that finds secrets
- `src/rotators` - rotator implementations (dry-run, apply)

Warning

This tool can mutate files when run with `--rotator apply`. Always run with `--dry-run` first and use `--force` to confirm destructive changes. See `SECURITY.md` for more details.

Tests

```powershell
npm test
```


## Configuration

This tool supports a project-level configuration file to customize detection patterns and behavior. The loader prefers a root config file in the scanned repo and falls back to the bundled defaults in `config/defaults.json`.

Supported file names (looked for in the repo root):

- `.secretsentinel.yaml` (YAML)
- `.secretsentinel.json` (JSON)

Example JSON config (`.secretsentinel.json`):

```json
{
	"patterns": [
		{ "name": "MY_API_KEY", "regex": "MYAPI_[A-Z0-9]{16}" }
	]
}
```

Example YAML config (`.secretsentinel.yaml`):

```yaml
patterns:
	- name: MY_API_KEY
		regex: MYAPI_[A-Z0-9]{16}
```

Notes

- If `js-yaml` is not installed in the environment, YAML parsing will be skipped and the loader will fall back to JSON/defaults.
- By default, if a root config file exists it is used; otherwise `config/defaults.json` provides the built-in patterns. If you want a different merge behavior, tell me and I will change the loader to merge root config with defaults.

