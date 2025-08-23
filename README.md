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
