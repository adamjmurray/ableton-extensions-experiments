# Developing the Extensions

How to build, run, and package the extensions in this repo. For a tour of what each
extension does, see [README.md](README.md); for the deeper SDK/architecture notes, see
[AGENTS.md](AGENTS.md).

## Prerequisites

- **Node.js 25+** (native TypeScript — the scripts here run `.ts` directly).
- **An Ableton Live beta** with Extensions support (Live 12 Beta or Live 13 Beta).
  The SDK is in beta, so Extensions only run in the beta builds.
- Install each extension's dependencies once: `cd <name>-extension && npm install`.

## Project layout

Each extension is a self-contained project in its own `<name>-extension/` directory
(`notation-extension/`, `mutate-extension/`, `drum-rack-jumbler-extension/`). The SDK
distribution lives in [`extensions-sdk/`](extensions-sdk/) and is depended on by path
(the `*.tgz` tarballs). Don't modify anything under `extensions-sdk/` — it's a vendored
drop.

## Per-extension scripts

Run these from inside an extension directory (e.g. `cd notation-extension`):

| Script | What it does |
| --- | --- |
| `npm run build` | Bundle `src/` to `dist/extension.cjs` (esbuild → CJS) |
| `npm run build:prod` | Production build (minified, no sourcemaps) |
| `npm run check` | Typecheck + format check + lint + tests — run before finishing work |
| `npm run fix` | Auto-fix formatting and safe lint issues (`biome check --write`) |
| `npm test` | Run the vitest suite |
| `npm run package` | Production build, then emit a `.ablx` archive |

## Running in Developer Mode (the dev loop)

Developer Mode lets you take over Live's Extension Host process so you can reload an
extension without restarting Live.

1. **Enable Developer Mode in Live.** Settings → Extensions → click the orange
   **Developer Mode** bar at the bottom. Live shuts down the Extension Host it normally
   manages and hands it to you.
2. **Build the extension first** — the dev script does *not* build for you:
   ```
   cd notation-extension && npm run build
   ```
3. **Launch it** from the repo root, naming the one extension to run:
   ```
   npm run dev -- notation-extension
   ```
4. **Iterate:** edit code → `npm run build` → `Ctrl+C` the dev script → re-run it. Live
   stays open the whole time; only the host process restarts. There is no file-watch /
   auto-reload.

When it starts you'll see the resolved paths:

```
Extension Host: …/Ableton Live 12 Beta.app/Contents/Helpers/ExtensionHost/ExtensionHostNodeModule.node
Extension:      …/notation-extension
Temp:           …/ableton-extensions-dev/notation-extension/temp
Storage:        …/ableton-extensions-dev/notation-extension/storage
```

### What `npm run dev` does for you

`scripts/dev.ts` is a thin wrapper around `extensions-cli run` that fills in the things
Live normally provides to a managed extension but the CLI does not:

- **Finds the host module.** It locates `ExtensionHostNodeModule.node` inside the Live
  app bundle and passes it via `--live`. The location has moved between releases
  (`Contents/Helpers/ExtensionHost` in Live 12.3/13, `Contents/App-Resources/…` in early
  betas), so it tries the known spots and falls back to a recursive search.
- **Matches the *running* Live.** The launched host has to pair with the Live process
  that's actually open, or it times out during bring-up. The script prefers the running
  Live and only falls back to the newest installed one if nothing is running.
- **Supplies temp/storage directories.** It passes `--temp-directory` and
  `--storage-directory` (under your OS temp dir, per extension). Without these,
  `context.environment.tempDirectory` / `storageDirectory` come back undefined and
  extensions that write files (e.g. Notation's dialog and exports) fail. Saved exports
  land in the printed `Storage:` path.

### Gotchas

- **Developer Mode hides your installed extensions.** While it's on, Live isn't running
  its managed host, so the installed `.ablx` copies go dark — and the dev host runs only
  the single extension you passed. Turn Developer Mode off to get the installed ones
  back. You do **not** need to uninstall an extension to dev on it.
- **"bring-up timed out (initial data model)"** means the launched host couldn't pair
  with Live. Usual causes: Developer Mode isn't enabled, or the host module came from a
  different Live than the one running (the script's running-Live preference normally
  prevents this).
- **"temp directory is unavailable"** (or undefined storage) means the host was launched
  without `--temp-directory` / `--storage-directory`. `npm run dev` supplies them; if you
  call `extensions-cli run` directly, pass them yourself.

## Packaging and installing

Build a distributable archive from an extension directory:

```
cd notation-extension && npm run package      # → Notation-1.0.0.ablx
```

Install by opening the `.ablx` in Live (Settings → Extensions → drag-and-drop or
**Choose file**). Distributed archives contain only `manifest.json` + the bundled entry
point — no `node_modules/`.

## Knowledge base (for Claude Projects)

`npm run kb` (from the repo root) flattens the SDK docs, examples, and extracted type
declarations into `knowledge-base/` for use as a Claude Project. The output is
gitignored.
