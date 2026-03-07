# Ableton Extensions SDK - Agent Instructions

## Project Overview
R&D monorepo for building Ableton Live extensions using the (alpha) Extensions SDK.
The SDK itself lives in `extensions-sdk/` as a vendored dependency. Our extensions go in `extensions/`.

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
├── scripts/build-kb.ts      # Builds knowledge-base/ for Claude Projects
├── knowledge-base/          # Generated, gitignored
└── package.json             # Root package (scripts only, no deps)
```

## Extension Development

### Creating a new extension
Each extension needs at minimum:
- `manifest.json` with `name`, `author`, `version`, `entry`, `minimumApiVersion`
- `package.json` with `"@ableton/extensions-sdk": "file:../../extensions-sdk"` as a dependency
- An entry point (TypeScript recommended, must be bundled to CJS for the runtime)

### Key patterns
- The extension entry point must export an `activate` function
- Initialize the API with: `const api = initialize(context, "<api-version>")`
- The Extension Host runs CommonJS only — always bundle with esbuild or tsdown to `.cjs`
- Extensions are distributed as ZIP files containing `manifest.json` + the compiled entry point

### Building
- Use esbuild or tsdown to bundle to CJS: `esbuild src/extension.ts --bundle --platform=node --format=cjs --outfile=dist/extension.cjs`
- Do not ship `node_modules/` or `package-lock.json` in extensions

### Testing
- Tests use vitest with `@ableton/extensions-sdk/testing` for mocking
- Run with `vitest run` or `npm test`

## Tech Stack
- Node.js 25+ (native TypeScript via `--experimental-strip-types`)
- TypeScript for all new code
- ESM modules (`"type": "module"` in root package.json)

## SDK Documentation
- HTML docs are in `extensions-sdk/docs/`
- Run `npm run build:kb` to flatten docs + examples + types into `knowledge-base/` for Claude Projects
- Key doc sections: getting-started, essentials (basics, concepts, interface), development

## Rules
- Do not modify anything inside `extensions-sdk/` — it is a vendored dependency
- Keep each extension self-contained with its own package.json and build
- Use `file:../../extensions-sdk` (adjust depth as needed) for the SDK dependency path
