# Developing the Extensions

How to build, run, and package the extensions in this repo. For a tour of what each
extension does, see [README.md](README.md); for the deeper SDK/architecture notes, see
[AGENTS.md](AGENTS.md).

## Prerequisites

- **Node.js 25+** (native TypeScript — the scripts here run `.ts` directly).
- **An Ableton Live beta** with Extensions support (Live 12 Beta or Live 13 Beta).
  The SDK is in beta, so Extensions only run in the beta builds.
- **The Extensions SDK**, obtained from Ableton (see below) — it is **not** included
  in this repo.
- Install each extension's dependencies once: `cd <name>-extension && npm install`.

## Project layout

Each extension is a self-contained project in its own `<name>-extension/` directory
(`notation-extension/`, `mutate-extension/`, `drum-rack-jumbler-extension/`).

The extensions depend on the SDK by path — the `*.tgz` tarballs in an `extensions-sdk/`
directory next to them. **That directory is gitignored and not committed**: Ableton's
SDK license forbids redistributing the (confidential, beta) SDK, so each developer
obtains it from Ableton and drops it in place. Get the SDK distribution from Ableton's
beta program, and put its tarballs (`ableton-extensions-sdk-*.tgz`,
`ableton-extensions-cli-*.tgz`, `ableton-create-extension-*.tgz`) in `extensions-sdk/`
at the repo root. The `file:../extensions-sdk/*.tgz` dependency paths then resolve and
`npm install` works. Don't modify anything inside `extensions-sdk/`.

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

## Repo-wide checks

From the **repo root**, these fan a script out across every `*-extension/` directory and
fail if any extension fails (so they gate CI):

| Script | Runs in each extension |
| --- | --- |
| `npm run check` | `check` — typecheck + format check + lint + tests |
| `npm run typecheck` | `typecheck` only |
| `npm run lint` | `lint` only |
| `npm test` | `test` only |

These are thin wrappers around `scripts/check-all.ts <script>`, which prints a per-
extension pass/fail summary. They assume each extension's dependencies are installed
(`npm ci` / `npm install` in each).

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on pushes to `main` and on
pull requests: it `npm ci`s each extension (the SDK/CLI tarballs are vendored under
`extensions-sdk/`, so installs resolve offline) and then runs the repo-wide
`npm run check`.

## Running in Developer Mode (the dev loop)

Developer Mode lets you take over Live's Extension Host process so you can reload an
extension without restarting Live.

1. **Enable Developer Mode in Live.** Settings → Extensions → click the orange
   **Developer Mode** bar at the bottom. Live shuts down the Extension Host it normally
   manages and hands it to you.
2. **Launch it** from the repo root, naming the one extension to run:
   ```
   npm run dev -- notation-extension
   ```
   The dev script builds the extension and then launches the host. Pass `--no-build` to
   skip the build (e.g. `npm run dev -- notation-extension --no-build`) when `dist/` is
   already current.
3. **Iterate:** edit code → `Ctrl+C` the dev script → re-run it (it rebuilds each time).
   Live stays open the whole time; only the host process restarts. There is no
   file-watch / auto-reload.

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

- **Builds the extension** (`npm run build` in its directory) before launching, so a
  re-run always picks up your latest code. Skip with `--no-build`.
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
