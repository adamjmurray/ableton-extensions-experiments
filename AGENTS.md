# Ableton Extensions SDK - Agent Instructions

## Project Overview
R&D monorepo for building Ableton Live extensions using the (alpha) Extensions SDK.
The SDK itself lives in `extensions-sdk/` as a vendored dependency. Our extensions go in `extensions/`.
`ableton-midi-sculptor/` contains an older Max for Live project being ported to an extension.

## Project Structure
```
.
├── extensions-sdk/          # Vendored SDK (not our code, do not modify)
│   ├── dist/                # Compiled SDK + type declarations
│   ├── docs/                # HTML documentation
│   └── examples/            # Official example extensions
├── extensions/              # Our extensions (each is an independent project)
│   └── <name>/
│       ├── manifest.json    # Extension metadata (name, author, version, entry, minimumApiVersion)
│       ├── package.json     # npm package (depends on SDK via file: path)
│       ├── src/extension.ts # Source code
│       └── dist/            # Build output (gitignored)
├── ableton-midi-sculptor/   # Original Max for Live project (reference for porting)
│   ├── src/                 # Core logic: Note, Clip, transformers (mostly pure JS, portable)
│   └── tests/               # Existing tests (port to vitest)
├── scripts/
│   ├── build-kb.ts          # Builds knowledge-base/ for Claude Projects
│   └── dev.ts               # Launches Extension Host in Developer Mode
├── knowledge-base/          # Generated, gitignored
└── package.json             # Root package (scripts only, no deps)
```

## Extension Development

### Current API version: 0.0.5
The SDK is at version 0.1.0-beta. Always use `initialize(context, "0.0.5")` and
`"minimumApiVersion": "0.0.5"` in manifest.json.

### Creating a new extension
Each extension needs at minimum:
- `manifest.json` with `name`, `author`, `version`, `entry`, `minimumApiVersion`
- `package.json` with `"@ableton/extensions-sdk": "file:../../extensions-sdk"` as a dependency
- An entry point (TypeScript recommended, must be bundled to CJS for the runtime)

See `extensions/my-extension/` for a working reference with esbuild config and modal dialog.

### Key patterns
- The extension entry point must export an `activate` function
- Initialize the API with: `const context = initialize(activation, "0.0.5")`
- The Extension Host runs CommonJS only — always bundle with esbuild to CJS
- Extensions are distributed as ZIP files containing `manifest.json` + the compiled entry point
- HTML files for webview dialogs are imported as text and passed as data URLs

### Context menu scopes
Valid scopes for `context.ui.registerContextMenuAction()`:
- `AudioTrack`, `MidiTrack` — right-click track header
- `AudioClip`, `MidiClip` — right-click a clip
- `ClipSlot` — right-click a clip slot
- `Scene` — right-click a scene
- `AudioTrack.ArrangementSelection`, `MidiTrack.ArrangementSelection` — right-click a time selection
- `ClipSlotSelection` — right-click with multiple clip slots selected in Session View

### Building
- Use esbuild to bundle to CJS (see `extensions/my-extension/esbuild.js` for config)
- Use `.html` loader in esbuild to inline webview HTML as text
- Do not ship `node_modules/` or `package-lock.json` in extensions

### Testing
- Tests use vitest with `@ableton/extensions-sdk/testing` for mocking
- Run with `vitest run` or `npm test`

### Running in Developer Mode
1. Open Live > Settings > Extensions > click DeveloperMode
2. Run `npm run dev` (or `npm run dev -- path/to/extension`)
3. The dev script auto-finds the Ableton Extension Host and connects to Live
4. Ctrl+C and re-run to pick up code changes (no need to restart Live)

## Tech Stack
- Node.js 25+ (native TypeScript support, no flags needed)
- TypeScript for all new code
- ESM modules (`"type": "module"` in root package.json)

## SDK Documentation
- HTML docs are in `extensions-sdk/docs/`
- Type declarations in `extensions-sdk/dist/` (check `index.d.cts` and `Application-*.d.cts`)
- Run `npm run build:kb` to flatten docs + examples + types into `knowledge-base/` for Claude Projects
- Key doc sections: getting-started, essentials (basics, concepts, interface), development

## Rules
- Do not modify anything inside `extensions-sdk/` — it is a vendored dependency
- Keep each extension self-contained with its own package.json and build
- Use `file:../../extensions-sdk` (adjust depth as needed) for the SDK dependency path
