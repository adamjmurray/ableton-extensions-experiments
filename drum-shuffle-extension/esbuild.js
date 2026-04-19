const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "es2020",
    minify: production,
    // Always ship a sourcemap — external .map during dev so stack traces
    // decode automatically, inline for production so the single distributed
    // .cjs inside the .ablx stays self-contained.
    sourcemap: production ? "inline" : true,
    sourcesContent: false,
    outfile: "dist/extension.cjs",
    logLevel: "warning",
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
