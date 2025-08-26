# SecretSentinel Notebook Extension (classic Jupyter)

This is a minimal, client-side nbextension for the classic Jupyter Notebook UI. It adds a toolbar button that scans all cells for secret-like patterns and shows a dialog with findings.

Notes:

- This example runs entirely in the browser; it doesn't call the CLI. It's a quick way to surface potential issues while editing notebooks.
- Patterns are a small subset embedded in the JS. For full power, run the CLI in CI or from a terminal.

Install (classic Notebook only):

```powershell
# From repo root
jupyter nbextension install .\examples\nbext\sentinelscan --sys-prefix
jupyter nbextension enable sentinelscan/main --sys-prefix
```

Usage:

- Open Jupyter Notebook (classic UI).
- Click the "Sentinel Scan" shield button in the toolbar.
- A dialog will list any findings with cell number and a snippet.

Uninstall:

```powershell
jupyter nbextension disable sentinelscan/main --sys-prefix
jupyter nbextension uninstall sentinelscan --sys-prefix
```

Next ideas:

- Wire to the CLI via a small server endpoint to reuse repo config.
- Severity badges and per-pattern tuning.
