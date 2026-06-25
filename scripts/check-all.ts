import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Runs an npm script in every `*-extension/` directory and reports a summary.
// Defaults to `check` (typecheck + format:check + lint + test); pass another
// script name to run it instead, e.g. `npm run check:all -- typecheck`.
// Exits non-zero if any extension fails, so it can gate CI.

const script = process.argv[2] ?? "check";
const root = resolve(import.meta.dirname!, "..");

const extensions = readdirSync(root, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      d.name.endsWith("-extension") &&
      existsSync(resolve(root, d.name, "package.json")),
  )
  .map((d) => d.name)
  .sort();

if (extensions.length === 0) {
  console.error("No *-extension directories found.");
  process.exit(1);
}

const failures: string[] = [];

for (const ext of extensions) {
  console.log(`\n── ${ext}: npm run ${script} ──\n`);
  const result = spawnSync("npm", ["run", script], {
    cwd: resolve(root, ext),
    stdio: "inherit",
  });
  if (result.status !== 0) failures.push(ext);
}

console.log(`\n${"─".repeat(40)}`);
for (const ext of extensions) {
  console.log(`${failures.includes(ext) ? "FAIL" : "ok  "}  ${ext}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} of ${extensions.length} failed.`);
  process.exit(1);
}
console.log(`\nAll ${extensions.length} passed.`);
