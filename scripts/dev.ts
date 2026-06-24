import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Thin wrapper around `extensions-cli run` (from @ableton-extensions/cli).
// The CLI needs EXTENSION_HOST_PATH (or --live) pointing at Live's
// ExtensionHostNodeModule.node; this script auto-detects the newest installed
// Ableton Live and passes it via --live, then delegates to the extension's
// local extensions-cli. Build the extension first (its `npm run build`);
// Ctrl+C and re-run to pick up changes.

const LIVE_APP_ROOT = "/Applications";
const EXTENSION_HOST_REL = "Contents/App-Resources/Extensions/ExtensionHost";

function findHostModule(): string {
  const apps = readdirSync(LIVE_APP_ROOT)
    .filter((name) => name.startsWith("Ableton Live") && name.endsWith(".app"))
    .sort()
    .reverse();

  for (const app of apps) {
    const module = resolve(LIVE_APP_ROOT, app, EXTENSION_HOST_REL, "ExtensionHostNodeModule.node");
    if (existsSync(module)) return module;
  }
  throw new Error("Could not find Ableton Live with Extension Host installed");
}

function resolveExtensionDir(): string {
  const args = process.argv.slice(2);
  if (args.length > 1) {
    throw new Error("`extensions-cli run` takes a single extension; pass exactly one path");
  }
  if (args.length === 1) {
    const abs = resolve(args[0]);
    if (!existsSync(resolve(abs, "manifest.json"))) {
      throw new Error(`No manifest.json found in ${abs}`);
    }
    return abs;
  }

  // No arg: default to the sole *-extension directory, else require a choice.
  const root = resolve(import.meta.dirname!, "..");
  const dirs = readdirSync(root, { withFileTypes: true }).filter(
    (d) =>
      d.isDirectory() &&
      d.name.endsWith("-extension") &&
      existsSync(resolve(root, d.name, "manifest.json")),
  );
  if (dirs.length === 1) return resolve(root, dirs[0].name);
  if (dirs.length === 0) {
    throw new Error("No *-extension directories found. Pass a path as an argument.");
  }
  throw new Error(
    `Multiple extensions found (${dirs.map((d) => d.name).join(", ")}). Pass one path as an argument.`,
  );
}

const hostModule = findHostModule();
const extDir = resolveExtensionDir();

console.log(`Extension Host: ${hostModule}`);
console.log(`Extension:      ${extDir}`);
console.log();

// Delegate to the extension's locally-installed extensions-cli.
execFileSync("npx", ["extensions-cli", "run", ".", "--live", hostModule], {
  cwd: extDir,
  stdio: "inherit",
});
