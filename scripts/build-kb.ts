import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const SDK = "extensions-sdk";
const OUT = "knowledge-base";

// Clear and recreate output
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

function flatten(filePath: string): string {
  return filePath.replaceAll("/", "--");
}

function copy(srcRelative: string, outName: string): void {
  cpSync(join(SDK, srcRelative), join(OUT, outName));
}

// --- Docs (HTML files, skip 404 and index landing page) ---
function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

const skipDocs = new Set(["404.html", "index.html"]);
for (const file of walkFiles(join(SDK, "docs"))) {
  if (extname(file) !== ".html") continue;
  if (skipDocs.has(basename(file))) continue;
  const rel = relative(SDK, file);
  copy(rel, flatten(rel));
}

// --- Examples (source files, skip node_modules, package-lock, tsconfig) ---
const skipFiles = new Set(["package-lock.json", "tsconfig.json"]);
const exampleExts = new Set([".ts", ".js", ".cjs", ".mjs", ".html", ".json"]);

for (const file of walkFiles(join(SDK, "examples"))) {
  if (file.includes("node_modules")) continue;
  if (skipFiles.has(basename(file))) continue;
  if (!exampleExts.has(extname(file))) continue;
  const rel = relative(SDK, file);
  copy(rel, flatten(rel));
}

// --- Type declarations (ESM .d.mts only, skip CLI and .map files) ---
const typeFiles: [string, string][] = [
  ["dist/index.d.mts", "types--index.d.mts"],
  ["dist/testing/index.d.mts", "types--testing--index.d.mts"],
];

// Find the Application .d.mts file (has a hash in the name)
for (const entry of readdirSync(join(SDK, "dist"))) {
  if (entry.startsWith("Application") && entry.endsWith(".d.mts")) {
    typeFiles.push([`dist/${entry}`, "types--Application.d.mts"]);
    break;
  }
}

for (const [src, out] of typeFiles) {
  copy(src, out);
}

// --- SDK config ---
copy("package.json", "sdk--package.json");
copy("tsconfig.json", "sdk--tsconfig.json");

// Summary
const count = readdirSync(OUT).length;
console.log(`Built knowledge base: ${count} files in ${OUT}/`);
