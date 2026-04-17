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
    sourcemap: !production,
    sourcesContent: false,
    external: ["@ableton/extensions-sdk"],
    outfile: "dist/extension.js",
    loader: { ".html": "text" },
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
