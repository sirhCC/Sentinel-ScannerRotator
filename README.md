# SecretSentinel-ScannerRotator

A small TypeScript CLI that scans files for secret-like patterns and supports pluggable rotators (dry-run/apply).

Quick start

1. Install dependencies

```powershell
npm install
```

1. Run in dev mode

```powershell
npm run dev -- <path-to-scan> --rotator dry-run
```

1. Build & run

```powershell
npm run build
npm start -- <path-to-scan> --rotator dry-run
```

CLI

- Help and version

```powershell
npm start -- --help
npm start -- --version
```

- Common flags (short and long forms)
  - `-r, --rotator <name>`: dry-run | apply
  - `-d, --dry-run`
  - `-f, --force`
  - `-i, --ignore <glob...>` (repeatable)
  - `-j, --log-json`
  - `-l, --log-level <error|warn|info|debug>`
  - `-c, --config <path>`
  - `-L, --list-rotators` (list available rotators and exit)
  - `-t, --template <tpl>` (apply replacement template; supports `{{match}}`, `{{timestamp}}`, `{{file}}`)
  - `-x, --rotators-dir <dir...>` (repeatable)

API

- `src/scanner.ts` - scanner that finds secrets
- `src/rotators` - rotator implementations (dry-run, apply)

Warning

This tool can mutate files when run with `--rotator apply`. Always run with `--dry-run` first and use `--force` to confirm destructive changes. See `SECURITY.md` for more details.

Tests

```powershell
npm test
## Examples

- List rotators

```powershell
npm start -- --list-rotators
npm start -- --list-rotators --log-json
```

- Apply with a template (dangerous; creates backups in `.sentinel_tmp`)

```powershell
npm start -- . --rotator apply --force --template "__MASKED_{{timestamp}}__"
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

CLI config flag

- Use `--config <path>` to point the CLI at a specific config file or directory. If a file is provided, its directory is used as the base for config lookup.

Custom rotators

- The CLI discovers rotators in `src/rotators/` (built-ins) and can also load custom rotators from additional directories via `--rotators-dir <dir>` (repeatable). A rotator must export an object with `name: string` and `rotate(finding, options?) => Promise<{ success: boolean; message?: string }>`.
- Example: `examples/rotators/exampleRotator.js` — try it:

```powershell
npm run build
npm start -- . --rotators-dir ./examples/rotators --rotator example --dry-run
```

Authoring custom rotators

- A rotator is an object with a `name` and an async `rotate(finding, options?)` method returning `{ success, message? }`.
- JavaScript example (export any rotator-shaped object):

```js
// plugins/rotators/myRotator.js
export const myRotator = {
  name: 'my-rotator',
  async rotate(finding, options) {
    // implement rotation
    return { success: true, message: `handled ${finding.filePath}:${finding.line}` };
  }
};
```

- TypeScript example using helper types:

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

- Run with your rotator directory:

```powershell
npm start -- . --rotators-dir ./plugins/rotators --rotator my-rotator --dry-run
```


