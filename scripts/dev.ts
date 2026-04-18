import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const LIVE_APP_ROOT = "/Applications";
const EXTENSION_HOST_REL = "Contents/App-Resources/Extensions/ExtensionHost";

function findLiveApp(): string {
  const apps = readdirSync(LIVE_APP_ROOT)
    .filter((name) => name.startsWith("Ableton Live") && name.endsWith(".app"))
    .sort()
    .reverse();

  for (const app of apps) {
    const hostDir = resolve(LIVE_APP_ROOT, app, EXTENSION_HOST_REL);
    if (existsSync(resolve(hostDir, "node"))) {
      return hostDir;
    }
  }
  throw new Error("Could not find Ableton Live with Extension Host installed");
}

function findExtensionPaths(): string[] {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    return args.map((arg) => {
      const abs = resolve(arg);
      if (!existsSync(resolve(abs, "manifest.json"))) {
        throw new Error(`No manifest.json found in ${abs}`);
      }
      return abs;
    });
  }

  // Default: load all sibling *-extension directories
  const root = resolve(import.meta.dirname!, "..");
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        d.name.endsWith("-extension") &&
        existsSync(resolve(root, d.name, "manifest.json")),
    );
  if (dirs.length === 0) {
    throw new Error("No *-extension directories found. Pass paths as arguments.");
  }
  return dirs.map((d) => resolve(root, d.name));
}

const hostDir = findLiveApp();
const extPaths = findExtensionPaths();

console.log(`Extension Host: ${hostDir}`);
for (const p of extPaths) {
  console.log(`Extension:      ${p}`);
}
console.log();

const node = resolve(hostDir, "node");
const module = resolve(hostDir, "ExtensionHostNodeModule.node");
const extensions = extPaths.map((p) => `{ path: ${JSON.stringify(p)} }`).join(", ");
const code = `require(${JSON.stringify(module)}).initialize({ extensions: [${extensions}] });`;

execFileSync(node, ["-e", code], { stdio: "inherit" });
