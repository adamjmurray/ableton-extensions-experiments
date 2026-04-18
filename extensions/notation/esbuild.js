const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  // Phase 1: Bundle the Preact UI (including OSMD) into a single JS string.
  // The UI is never minified: OSMD ships already-minified, and our own UI
  // code is small. Minifying the combined bundle broke the webview bridge
  // (dialog.show() resolved empty), so we leave it alone.
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
      build.onResolve({ filter: /notation\.html$/ }, (args) => ({
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
    minify: production,
    // Always ship a sourcemap — external .map during dev (so browsers /
    // Node map stack traces automatically) and inline for production, so
    // the single distributed .cjs in the .ablx stays self-contained and
    // user-reported stack traces remain decodable.
    sourcemap: production ? "inline" : true,
    sourcesContent: false,
    platform: "node",
    external: ["@ableton/extensions-sdk"],
    outfile: "dist/extension.cjs",
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
