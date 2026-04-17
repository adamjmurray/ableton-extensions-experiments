import { describe, expect, it } from "vitest";
import { escapeDialogPayload } from "./escape.js";

describe("escapeDialogPayload", () => {
  it("escapes backslashes first (double-escape is safe)", () => {
    expect(escapeDialogPayload("\\")).toBe("\\\\");
  });

  it("escapes single quotes", () => {
    expect(escapeDialogPayload("it's")).toBe("it\\'s");
  });

  it("escapes < and > so </script> cannot close the script tag", () => {
    expect(escapeDialogPayload("</script>")).toBe("\\u003c/script\\u003e");
  });

  it("escapes U+2028 and U+2029 line terminators", () => {
    expect(escapeDialogPayload("a\u2028b\u2029c")).toBe("a\\u2028b\\u2029c");
  });

  it("passes through ordinary characters unchanged", () => {
    const src = '{"hello":"world","n":42}';
    expect(escapeDialogPayload(src)).toBe('{"hello":"world","n":42}');
  });

  it("round-trips through JS string literal evaluation", () => {
    // The injected script runs: window.__NOTATION_DATA__ = '<escaped>';
    // eval('<escaped>') in single-quoted context should yield the original.
    const original = '{"name":"</script>\\"tricky\'\\\\"}';
    const escaped = escapeDialogPayload(original);
    // Roundtrip: embed in a single-quoted JS literal and evaluate.
    const restored = (new Function(`return '${escaped}'`))();
    expect(restored).toBe(original);
  });

  it("handles the full chain: typical payload with quoted values, angle brackets, and backslashes", () => {
    const payload = JSON.stringify({ name: '</script>\\n"hi"', notes: [] });
    const escaped = escapeDialogPayload(payload);
    expect(escaped).not.toContain("</script>");
    expect(escaped).not.toContain("\n"); // real newlines were never present (JSON.stringify escapes them)
    const restored = (new Function(`return '${escaped}'`))();
    expect(JSON.parse(restored)).toEqual({ name: '</script>\\n"hi"', notes: [] });
  });
});
