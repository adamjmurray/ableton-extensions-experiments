// Strip any directory components from the webview-supplied filename and
// replace characters that would be problematic on common filesystems. The
// webview is trusted code, but clip names flow through it unmodified, so a
// clip named "../../foo" or "bad:name" could otherwise escape the export
// directory or produce an invalid path. We split on both / and \ so
// Windows-style paths are neutralized on POSIX hosts too.
export function sanitizeFilename(filename: string): string {
  const parts = filename.split(/[\\/]/);
  const base = parts[parts.length - 1] ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: sanitizing control chars IS the point.
  const cleaned = base.replace(/[<>:"|?*\x00-\x1f]/g, "_").replace(/^\.+/, "");
  return cleaned || "notation";
}
