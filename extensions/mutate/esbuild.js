const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  // Phase 1: Bundle the Preact UI into a single JS string.
  // The UI is never minified — notation hit a webview-bridge bug where a
  // minified UI made dialog.show() resolve with an empty string; mutate's
  // UI is smaller but not worth the risk to shave a few KB.
  const uiResult = await esbuild.build({
    entryPoints: ["src/ui/app.tsx"],
    bundle: true,
    format: "iife",
    write: false,
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    jsxImportSource: "preact",
    logLevel: "warning",
  });

  const uiJs = uiResult.outputFiles[0].text;

  // Phase 2: Inject bundled JS into the HTML template
  const template = fs.readFileSync(
    path.join(__dirname, "src/ui/template.html"),
    "utf8",
  );
  const html = template.replace("/* __UI_BUNDLE__ */", uiJs);

  // Phase 3: Bundle the extension, providing the generated HTML via plugin
  const uiHtmlPlugin = {
    name: "ui-html",
    setup(build) {
      build.onResolve({ filter: /mutate-dialog\.html$/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path),
        namespace: "ui-html",
      }));
      build.onLoad({ filter: /.*/, namespace: "ui-html" }, () => ({
        contents: html,
        loader: "text",
      }));
    },
  };

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
    external: ["@ableton/extensions-sdk"],
    outfile: "dist/extension.cjs",
    loader: { ".html": "text" },
    logLevel: "warning",
    plugins: [uiHtmlPlugin],
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
