# Ableton Extensions SDK - Agent Instructions

## Project Overview
R&D monorepo for building Ableton Live extensions using the (beta) Extensions SDK.
The SDK is distributed as npm tarballs that live in `extensions-sdk/` (the directory
name is stable; the current drop is **1.0.0-beta.0** — see the tgz filenames). Each of
our extensions lives in a sibling `<name>-extension/` directory at the repo root — this
layout means an extension directory can be dropped next to an `extensions-sdk/` on any
machine and build without path edits.

## Project Structure
```
.
├── extensions-sdk/          # SDK distribution drop (not our code, do not modify)
│   ├── ableton-extensions-sdk-1.0.0-beta.0.tgz     # the SDK package (depend on this)
│   ├── ableton-extensions-cli-1.0.0-beta.0.tgz     # the CLI: `extensions-cli run` / `package`
│   ├── ableton-create-extension-1.0.0-beta.0.tgz   # project scaffolder
│   ├── api/                 # Generated typedoc HTML (API reference)
│   ├── docs/                # HTML documentation
│   └── examples/            # Official example extensions
├── mutate-extension/        # Our extensions (each is an independent project)
├── notation-extension/      # — sibling `<name>-extension/` dirs at the repo root
│   ├── manifest.json        # Extension metadata (name, author, version, entry, minimumApiVersion)
│   ├── package.json         # npm package (depends on the SDK tgz via file:../extensions-sdk/…tgz)
│   ├── src/extension.ts     # Source code
│   └── dist/                # Build output (gitignored)
├── scripts/
│   ├── build-kb.ts          # Builds knowledge-base/ for Claude Projects
│   └── dev.ts               # Launches Extension Host in Developer Mode
├── knowledge-base/          # Generated, gitignored
└── package.json             # Root package (scripts only, no deps)
```

## Extension Development

### Current API version: 1.0.0
The SDK is at version 1.0.0-beta.0 (package scope `@ableton-extensions/sdk`; the CLI
is the separate `@ableton-extensions/cli`). Always use `initialize(context, "1.0.0")`
and `"minimumApiVersion": "1.0.0"` in manifest.json. The API-version literal also appears
as a generic type parameter throughout (e.g. `MidiClip<"1.0.0">`).

> Migration note: a prior drop used scope `@ableton/extensions-sdk` and API version
> `"0.0.5"`. Beta renamed the scope and bumped the API to `"1.0.0"`. If you see the old
> scope or version anywhere, it predates this migration.

### Creating a new extension
Each extension needs at minimum:
- `manifest.json` with `name`, `author`, `version`, `entry`, `minimumApiVersion`
- `package.json` depending on the SDK tgz:
  `"@ableton-extensions/sdk": "file:../extensions-sdk/ableton-extensions-sdk-1.0.0-beta.0.tgz"`,
  plus the CLI as a devDependency:
  `"@ableton-extensions/cli": "file:../extensions-sdk/ableton-extensions-cli-1.0.0-beta.0.tgz"`
- An entry point (TypeScript recommended, must be bundled to CJS for the runtime)

See `mutate-extension/` for a minimal reference (single-phase esbuild, stub modal dialog) or `notation-extension/` for a full-featured reference (Preact UI, vitest tests).

### Key patterns
- The extension entry point must export an `activate` function
- Initialize the API with: `const context = initialize(activation, "1.0.0")`
- Resolve context-menu handles with `context.getObjectFromHandle(handle, Type)` (note: in
  beta this is a direct context method — the old `context.objects.getObjectFromHandle` is gone)
- Open modal dialogs with `context.ui.showModalDialog(url, w, h): Promise<string>`
  (replaces the old `context.createModalDialog().show(...)`)
- The Extension Host runs CommonJS only — always bundle with esbuild to CJS
- Extensions are distributed as `.ablx` files (zip archives) containing `manifest.json` + the compiled entry point. Build them with `extensions-cli package . -o <Name>-<version>.ablx` from the extension directory (it does **not** run your build — build first); users install by opening the `.ablx` in Live.
- We use `dist/extension.cjs` as the entry (CJS-explicit); the beta examples use
  `dist/extension.js`. Either works as long as `manifest.entry` matches the esbuild outfile.
- HTML files for webview dialogs are imported as text and passed as data URLs or `file://` URLs

### Context menu scopes
Valid scopes for `context.ui.registerContextMenuAction()` (now a typed
`ContextMenuScope` union, not a plain string):
- `AudioTrack`, `MidiTrack` — right-click track header
- `AudioClip`, `MidiClip` — right-click a clip
- `ClipSlot` — right-click a clip slot
- `Scene` — right-click a scene
- `DrumRack`, `Simpler`, `Sample` — beta additions (right-click the respective device/sample)
- `AudioTrack.ArrangementSelection`, `MidiTrack.ArrangementSelection` — right-click a time selection
- `ClipSlotSelection` — right-click with multiple clip slots selected in Session View

### Building
- Use esbuild to bundle to CJS (see `mutate-extension/esbuild.js` for a minimal single-phase config, or `notation-extension/esbuild.js` for a two-phase UI-bundling config)
- Use `.html` loader in esbuild to inline webview HTML as text
- Distributed extensions (`.ablx`) should not include `node_modules/` or `package-lock.json`

### Testing
- Tests use vitest. Run with `vitest run` or `npm test`.
- **The beta SDK dropped the `@ableton-extensions/sdk/testing` subpath** (the old
  `TestHarness`). It was welded to the removed `0.0.5` host interfaces, so it could not
  survive the 1.0.0 restructure; a 1.0.0 harness is expected back in a later beta. Until
  then there is no host-API mock — the `TestHarness`-based `extension.test.ts` integration
  tests were removed. Keep covering pure logic (transforms, quantize, musicxml, etc.) with
  plain vitest. TODO: reintroduce integration tests when the harness returns.

### Formatting & linting
- Biome handles both formatting and linting. Config lives per-extension in `biome.json`.
- `npm run format` auto-fixes; `npm run format:check` reports without writing.
- `npm run lint` runs linter; `npm run lint:fix` applies safe auto-fixes.
- `npm run fix` is the one-shot: runs both format + safe lint fixes (`biome check --write`).
  **Agents: prefer `npm run fix` over `npm run format` before finishing a task** — it's strictly
  more thorough and equally safe (Biome only applies fixes marked `safe`).
- `npm run check` gates on format, lint, and tests.
- File/function length limits (`noExcessiveLinesPerFile`, `noExcessiveLinesPerFunction`) are set
  **just above current ceilings** and ratchet downward: when you shrink a file or function below
  the current `maxLines`, drop `maxLines` to the new ceiling in the same PR.

### Running in Developer Mode
1. Open Live > Settings > Extensions > click DeveloperMode
2. Build the extension first (`cd <ext> && npm run build`)
3. Run `npm run dev -- path/to/extension` from the repo root (a single extension at a time)
4. `scripts/dev.ts` auto-finds the newest installed Ableton Live's
   `ExtensionHostNodeModule.node` and delegates to the extension's local
   `extensions-cli run . --live <hostModule>` (so you don't have to set `EXTENSION_HOST_PATH`)
5. Ctrl+C and re-run (after rebuilding) to pick up code changes (no need to restart Live)

Alternatively, run the CLI directly from an extension dir: set `EXTENSION_HOST_PATH`
(in the environment or a `.env` file) to Live's `ExtensionHostNodeModule.node`, then
`npx extensions-cli run`.

## Tech Stack
- Node.js 25+ (native TypeScript support, no flags needed)
- TypeScript for all new code
- ESM modules (`"type": "module"` in root package.json)

## SDK Documentation
- HTML docs are in `extensions-sdk/docs/`; generated typedoc API reference in `extensions-sdk/api/`
- Type declarations are bundled **inside the SDK tgz** (`package/dist/index.d.cts` / `index.d.mts`),
  and after `npm install` are available at `node_modules/@ableton-extensions/sdk/dist/`
- Run `npm run kb` to flatten docs + examples + the extracted SDK types into `knowledge-base/`
  for Claude Projects (the build extracts `index.d.mts` + `package.json` from the SDK tgz)
- Key doc sections: getting-started, essentials (basics, concepts, interface), development

## Active Focus: Notation Extension

The current focus is `notation-extension/` — an extension that renders MIDI clips as
sheet music notation. Right-click → "Notation: Render …" opens a modal dialog;
multi-clip entry points render each clip on its own staff in a score layout.

### Architecture
- `src/extension.ts` — reads clip notes + song metadata, opens dialog in a loop.
  The dialog HTML + payload are written as real files under `environment.tempDirectory`
  and loaded via `pathToFileURL()` `file://` URLs (a Windows fix — the old `data:` URL +
  shell-`open` approach is gone). Save actions (PNG/SVG/MusicXML) write the file into
  `environment.storageDirectory` and report the path back; the dialog re-shows after.
  Registers six context menu actions:
  - `MidiClip` → "Render Clip" (single clip, Session or Arrangement)
  - `ClipSlotSelection` → "Render Selection" (Session, one or more slots)
  - `Scene` → "Render Scene" (all MIDI clips in a scene's row)
  - `MidiTrack.ArrangementSelection` → "Render Selection" (Arrangement time range;
    MIDI clips overlapping the range via `track.arrangementClips`)
  - `MidiTrack` → "Render Track (Session)" (all clipSlots flattened onto one staff;
    empty slots become bar rests, trailing empties trimmed)
  - `MidiTrack` → "Render Track (Arrangement)" (all arrangementClips flattened onto
    one staff aligned to the arrangement bar grid; gaps become rest measures).
    Session vs arrangement is exposed as two menu items because the SDK currently
    provides no way to detect which view the user right-clicked from.
- `src/ui/app.tsx` — Preact UI with toolbar (quantize, time sig, view toggle, export)
- `src/ui/musicxml.ts` — converts quantized MIDI notes to MusicXML
- `src/ui/quantize.ts` — snaps notes to grid (16th, mixed 16th/triplet, 32nd)
- `src/ui/bridge.ts` — webview ↔ extension host communication. The dialog posts
  `{ method: "close_and_send", params: [resultString] }` to the host (the beta envelope;
  the old `{ name, args }` shape no longer works) via
  `window.webkit.messageHandlers.live` (macOS) / `window.chrome.webview` (Windows)
- `src/ui/template.html` — HTML shell with CSS; JS is bundled and injected by esbuild

### Pipeline: MIDI notes → quantize → MusicXML → OSMD renders SVG
- Multi-clip: each clip becomes a separate `<part>` in MusicXML with its own staff and clef
- Uses 24 divisions per quarter note (LCM of 8 and 6) to support both 32nds and triplets
- Triplet notes need `<time-modification>` and `<tuplet>` bracket notation in MusicXML
- Key signature derived from `song.rootNote` + `song.scaleName`
- Time signature from first scene (defaults to 4/4 if scene returns -1)
- Clef auto-detected from average pitch (bass clef below middle C)

### Known limitations
- Webview (WKWebView/WebView2) does not support `download` attribute or `navigator.clipboard` —
  file export goes through extension host via `close_and_send`, Cmd+C doesn't work
- SDK properties may return BigInt — always coerce with `Number()` / `String()` before serializing.
  For debug logging of unknown shapes, `JSON.stringify` throws on BigInt; use a replacer:
  ```ts
  const stringify = (v: unknown) =>
    JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val));
  ```
  Context-menu command handlers receive the target handle as a BigInt `arg`, so logging
  `arg` directly needs this replacer (or `String(arg)` for scalars)
- Dialog communication is one-way: data injected before show, single JSON result on close
- The SDK reports `clip.endMarker` at the absolute clip end rather than the
  playback end, so renderers use `clip.loopEnd` as the effective end regardless of
  whether the clip is looping. (Observed under alpha; re-verify under beta.)
- A Drum Rack only classifies correctly when it sits at the top level of a track.
  Once wrapped inside an Instrument Rack, the host stops tagging its pad chains as
  `DrumChain`, the nested `RackDevice.chains` accessor returns empty, and
  `getObjectIsOfClass(handle, "DrumChain")` also returns false — nothing surfaces a
  drum tag. The notation extension falls back to a track/rack name heuristic
  (`drums` / `kit`, case-insensitive) for the wrapped case; see
  [notation-extension/src/extension.ts](notation-extension/src/extension.ts).
  Note: the beta `getObjectIsOfClass` takes a plain `className` string (the `ObjectClass`
  enum was removed), and beta adds a first-class `DrumRack` class plus a `"DrumRack"`
  context-menu scope — worth re-testing whether these classify the wrapped case now.

### Clip render region
The shared helper `getClipRenderRegion(clip, beatsPerMeasure)` in [src/ui/musicxml.ts](notation-extension/src/ui/musicxml.ts)
is the single source of truth for how a clip's playback region maps onto the
notated staff. It returns `{ filterStart, renderEnd, renderStart, barCount }`:
- `filterStart` — `min(loopStart, startMarker)` if looping (the loop region plays
  even when it precedes startMarker), else `startMarker`. Notes before this time
  are dropped.
- `renderEnd` — always `clip.loopEnd` (see the alpha-SDK endMarker caveat above).
- `renderStart` — `floor(filterStart / beatsPerMeasure) * beatsPerMeasure`; the
  first notated bar rounds back to the previous barline so the staff grid aligns
  to the song, with any sub-bar offset rendered as leading rests.
- `barCount` — `max(1, ceil((renderEnd - renderStart) / beatsPerMeasure))`; the
  number of notated measures the clip occupies, rounded up so partial-bar clips
  leave trailing rests.

The "Render Track" handlers reuse this helper to compute per-clip bar spans
when flattening a track's clips into a single staff.

### Development workflow
Always rebuild after making changes: `cd notation-extension && npm run build`
Test in Live with: `npm run dev -- notation-extension` (from repo root)
Before finishing a task, `npm run check` (typecheck + vitest) must pass.

### Tracking
Issues are tracked in Linear under the "MIDI Notation Extension" project (AJM-xxx).

## Rules
- Do not modify anything inside `extensions-sdk/` — it is a vendored SDK distribution drop
- Keep each extension self-contained with its own package.json and build
- Depend on the SDK/CLI tarballs by path (extensions are siblings of `extensions-sdk/`):
  `file:../extensions-sdk/ableton-extensions-sdk-1.0.0-beta.0.tgz` (and the matching `-cli-` tgz).
  When a newer SDK drop lands, replace the tgz files in `extensions-sdk/` and bump these paths.
