import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

const SDK = "extensions-sdk";
const OUT = "knowledge-base";

// Clear and recreate output
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

// Extensions that Claude Projects (or other upload targets) may block
const appendTxt = new Set([".mts", ".cts"]);

function flatten(filePath: string): string {
  return filePath.replaceAll("/", "--");
}

function outputName(flatName: string): string {
  const ext = extname(flatName);
  return appendTxt.has(ext) ? flatName + ".txt" : flatName;
}

function copy(srcRelative: string, outName: string): void {
  cpSync(join(SDK, srcRelative), join(OUT, outName));
}

// --- HTML to Markdown conversion for Starlight docs ---
function decodeHtmlEntities(text: string): string {
  return text
    .replaceAll("&#x22;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#x60;", "`")
    .replaceAll("&#x3C;", "<")
    .replaceAll("&#x3E;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function htmlToMarkdown(html: string): string {
  // Extract title from h1
  const titleMatch = html.match(/<h1[^>]*id="_top"[^>]*>([^<]+)/);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract description from the p after h1
  const descMatch = html.match(/<h1[^>]*>.*?<\/h1>\s*<p[^>]*>([^<]+)<\/p>/s);
  const description = descMatch ? descMatch[1].trim() : "";

  // Extract main content
  const contentMatch = html.match(/<div class="sl-markdown-content">\s*([\s\S]*?)\s*<\/div>\s*<\/div>\s*<footer/);
  if (!contentMatch) return `# ${title}\n\n${description}\n`;
  let content = contentMatch[1];

  // Replace code blocks: extract lines from ec-line divs, language from pre data-language
  content = content.replace(
    /<div class="expressive-code">.*?<pre data-language="(\w+)"><code>([\s\S]*?)<\/code><\/pre>[\s\S]*?<\/figure><\/div>/gs,
    (_, lang, codeHtml) => {
      const lines = [...codeHtml.matchAll(/<div class="ec-line"><div class="code">(.*?)<\/div><\/div>/g)]
        .map(m => decodeHtmlEntities(m[1].replace(/<[^>]+>/g, "")));
      return `\n\`\`\`${lang}\n${lines.join("\n")}\n\`\`\`\n`;
    }
  );

  // Replace asides (notes, tips, cautions)
  content = content.replace(
    /<aside[^>]*class="starlight-aside starlight-aside--(\w+)"[^>]*>.*?<p class="starlight-aside__title"[^>]*>.*?<\/p>\s*<div class="starlight-aside__content">\s*([\s\S]*?)\s*<\/div>\s*<\/aside>/gs,
    (_, type, body) => {
      const label = type.charAt(0).toUpperCase() + type.slice(1);
      return `\n> **${label}:** ${body.trim()}\n`;
    }
  );

  // Strip heading wrappers, keep just the heading tag
  content = content.replace(
    /<div class="sl-heading-wrapper level-h(\d)">\s*(<h\d[^>]*>[\s\S]*?<\/h\d>)[\s\S]*?<\/div>/g,
    (_, _level, heading) => heading
  );

  // Convert headings (strip nested tags like anchor spans)
  content = content.replace(/<h([2-6])[^>]*>([\s\S]*?)<\/h\1>/g, (_, level, text) => {
    const clean = text.replace(/<[^>]+>/g, "").trim();
    return `\n${"#".repeat(Number(level))} ${clean}\n`;
  });

  // Convert ordered lists
  content = content.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gs, (_, items) => {
    let i = 0;
    return (
      "\n" +
      items.replace(/<li[^>]*>([\s\S]*?)<\/li>/gs, (_: string, text: string) => {
        i++;
        return `${i}. ${text.replace(/<[^>]+>/g, "").trim()}\n`;
      })
    );
  });

  // Convert unordered lists
  content = content.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gs, (_, items) => {
    return (
      "\n" +
      items.replace(/<li[^>]*>([\s\S]*?)<\/li>/gs, (_: string, text: string) => {
        return `- ${text.replace(/<[^>]+>/g, "").trim()}\n`;
      })
    );
  });

  // Convert links
  content = content.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, text) => {
    const clean = text.replace(/<[^>]+>/g, "").trim();
    return `[${clean}](${href})`;
  });

  // Convert inline formatting
  content = content.replace(/<code[^>]*>([\s\S]*?)<\/code>/g, (_, text) => `\`${text}\``);
  content = content.replace(/<strong>([\s\S]*?)<\/strong>/g, (_, text) => `**${text}**`);
  content = content.replace(/<em>([\s\S]*?)<\/em>/g, (_, text) => `*${text}*`);

  // Convert paragraphs
  content = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_, text) => `\n${text.trim()}\n`);

  // Strip remaining HTML tags
  content = content.replace(/<[^>]+>/g, "");

  // Decode entities in final output
  content = decodeHtmlEntities(content);

  // Clean up whitespace: collapse multiple blank lines
  content = content.replace(/\n{3,}/g, "\n\n").trim();

  let result = `# ${title}\n`;
  if (description) result += `\n${description}\n`;
  result += `\n${content}\n`;
  return result;
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
  const html = readFileSync(join(SDK, rel), "utf-8");
  const md = htmlToMarkdown(html);
  const outName = outputName(flatten(rel).replace(/\.html$/, ".md"));
  writeFileSync(join(OUT, outName), md);
}

// --- Examples (source files, skip node_modules, package-lock, tsconfig) ---
const skipFiles = new Set(["package-lock.json", "tsconfig.json"]);
const exampleExts = new Set([".ts", ".js", ".cjs", ".mjs", ".html", ".json"]);

for (const file of walkFiles(join(SDK, "examples"))) {
  if (file.includes("node_modules")) continue;
  if (skipFiles.has(basename(file))) continue;
  if (!exampleExts.has(extname(file))) continue;
  const rel = relative(SDK, file);
  copy(rel, outputName(flatten(rel)));
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
  copy(src, outputName(out));
}

// --- SDK config ---
copy("package.json", "sdk--package.json");
copy("tsconfig.json", "sdk--tsconfig.json");

// --- Notation extension (our primary extension source) ---
const NOTATION = "extensions/notation";
const notationSkipDirs = new Set(["node_modules", "dist"]);
const notationSkipFiles = new Set(["package-lock.json"]);
const notationExts = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs", ".html", ".json"]);

function walkNotation(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (notationSkipDirs.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkNotation(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

for (const file of walkNotation(NOTATION)) {
  if (notationSkipFiles.has(basename(file))) continue;
  if (!notationExts.has(extname(file))) continue;
  const rel = relative(".", file);
  cpSync(file, join(OUT, outputName(flatten(rel))));
}

// Summary
const count = readdirSync(OUT).length;
console.log(`Built knowledge base: ${count} files in ${OUT}/`);
