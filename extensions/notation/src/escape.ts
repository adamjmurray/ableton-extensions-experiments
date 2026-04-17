// Escape a JSON string so it survives being embedded as a single-quoted JS
// string literal inside a <script> block in an HTML document.
//
// JSON.stringify's output already escapes `"`, `\n`, `\r`, `\t`, etc. — but
// it does not escape `'`, `<`, `>`, or the U+2028/U+2029 line terminators.
// Without these additional escapes:
//   - a clip named "</script>" closes the script tag early (HTML parser
//     scans for literal `</script>`, regardless of JS string context);
//   - a name containing a single-quote breaks out of the string literal;
//   - U+2028/U+2029 are valid JS line terminators and would split the
//     literal across lines.
export function escapeDialogPayload(jsonString: string): string {
  return jsonString
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
