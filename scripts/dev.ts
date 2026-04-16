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

function findExtensionPath(): string {
  const arg = process.argv[2];
  if (arg) {
    const abs = resolve(arg);
    if (!existsSync(resolve(abs, "manifest.json"))) {
      throw new Error(`No manifest.json found in ${abs}`);
    }
    return abs;
  }

  // Default: find first extension in extensions/
  const extDir = resolve(import.meta.dirname!, "..", "extensions");
  if (!existsSync(extDir)) {
    throw new Error("No extensions/ directory found. Pass a path as argument.");
  }
  const dirs = readdirSync(extDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(extDir, d.name, "manifest.json")));
  if (dirs.length === 0) {
    throw new Error("No extensions found in extensions/. Pass a path as argument.");
  }
  if (dirs.length > 1) {
    console.log(`Multiple extensions found, using: ${dirs[0].name}`);
  }
  return resolve(extDir, dirs[0].name);
}

const hostDir = findLiveApp();
const extPath = findExtensionPath();

console.log(`Extension Host: ${hostDir}`);
console.log(`Extension:      ${extPath}`);
console.log();

const node = resolve(hostDir, "node");
const module = resolve(hostDir, "ExtensionHostNodeModule.node");
const code = `require(${JSON.stringify(module)}).initialize({ extensions: [{ path: ${JSON.stringify(extPath)} }] });`;

execFileSync(node, ["-e", code], { stdio: "inherit" });
