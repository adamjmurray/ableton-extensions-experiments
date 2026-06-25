import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

// Thin wrapper around `extensions-cli run` (from @ableton-extensions/cli).
// The CLI needs EXTENSION_HOST_PATH (or --live) pointing at Live's
// ExtensionHostNodeModule.node; this script auto-detects the running (else newest
// installed) Ableton Live, supplies dev temp/storage directories, builds the
// extension (npm run build, skip with --no-build), then delegates to its local
// extensions-cli. Ctrl+C and re-run to pick up changes. See DEVELOPERS.md.

const LIVE_APP_ROOT = "/Applications";
const HOST_MODULE = "ExtensionHostNodeModule.node";
// Relative location of the host module within a Live .app bundle. This has moved
// between releases (App-Resources/Extensions in early betas, Helpers in Live 12.3/13),
// so we try the known locations and fall back to a recursive search.
const EXTENSION_HOST_RELS = [
  "Contents/Helpers/ExtensionHost",
  "Contents/App-Resources/Extensions/ExtensionHost",
];

function findInApp(app: string): string | undefined {
  for (const rel of EXTENSION_HOST_RELS) {
    const module = resolve(LIVE_APP_ROOT, app, rel, HOST_MODULE);
    if (existsSync(module)) return module;
  }
  // Fallback: recursive search in case the bundle layout changed again.
  try {
    const hit = execFileSync("find", [resolve(LIVE_APP_ROOT, app), "-name", HOST_MODULE], {
      encoding: "utf8",
    })
      .split("\n")
      .find(Boolean);
    if (hit) return hit;
  } catch {
    // `find` failed (e.g. permissions); fall through.
  }
  return undefined;
}

// The host module must come from the SAME Live that's currently running, or the
// launched host times out trying to pair with Live ("bring-up timed out"). So we
// prefer the running Live's .app, falling back to the newest installed one.
function findRunningLiveApp(): string | undefined {
  try {
    const out = execFileSync("ps", ["-Axo", "comm"], { encoding: "utf8" });
    const match = out.match(/\/Applications\/Ableton Live[^/]*\.app/);
    return match?.[0];
  } catch {
    return undefined;
  }
}

function findHostModule(): string {
  const installed = readdirSync(LIVE_APP_ROOT)
    .filter((name) => name.startsWith("Ableton Live") && name.endsWith(".app"))
    .sort()
    .reverse()
    .map((name: string) => resolve(LIVE_APP_ROOT, name));

  // Try the running Live first, then fall back to newest installed.
  const running = findRunningLiveApp();
  const candidates = running
    ? [running, ...installed.filter((a: string) => a !== running)]
    : installed;

  for (const app of candidates) {
    const module = findInApp(app);
    if (module) {
      if (app === running) console.log(`(using running Live: ${app})`);
      return module;
    }
  }
  throw new Error("Could not find Ableton Live with Extension Host installed");
}

function resolveExtensionDir(positional: string[]): string {
  if (positional.length > 1) {
    throw new Error("`extensions-cli run` takes a single extension; pass exactly one path");
  }
  if (positional.length === 1) {
    const abs = resolve(positional[0]);
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

const rawArgs = process.argv.slice(2);
const skipBuild = rawArgs.includes("--no-build");
const positional = rawArgs.filter((a: string) => !a.startsWith("--"));

const hostModule = findHostModule();
const extDir = resolveExtensionDir(positional);

// Build first (like the official `npm start`), unless --no-build was passed.
if (!skipBuild) {
  console.log("Building extension...");
  execFileSync("npm", ["run", "build"], { cwd: extDir, stdio: "inherit" });
  console.log();
}

// When Live manages the Extension Host it provides temp/storage directories; when
// we take over the host via the CLI, we must supply them ourselves or
// context.environment.{tempDirectory,storageDirectory} come back undefined.
const devRoot = resolve(tmpdir(), "ableton-extensions-dev", basename(extDir));
const tempDirectory = resolve(devRoot, "temp");
const storageDirectory = resolve(devRoot, "storage");
mkdirSync(tempDirectory, { recursive: true });
mkdirSync(storageDirectory, { recursive: true });

console.log(`Extension Host: ${hostModule}`);
console.log(`Extension:      ${extDir}`);
console.log(`Temp:           ${tempDirectory}`);
console.log(`Storage:        ${storageDirectory}`);
console.log();

// Delegate to the extension's locally-installed extensions-cli.
execFileSync(
  "npx",
  [
    "extensions-cli",
    "run",
    ".",
    "--live",
    hostModule,
    "--temp-directory",
    tempDirectory,
    "--storage-directory",
    storageDirectory,
  ],
  {
    cwd: extDir,
    stdio: "inherit",
  },
);
