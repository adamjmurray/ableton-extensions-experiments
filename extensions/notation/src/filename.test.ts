import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "./filename.js";

describe("sanitizeFilename", () => {
  it("passes through a normal filename", () => {
    expect(sanitizeFilename("score.svg")).toBe("score.svg");
  });

  it("strips directory components from relative traversal", () => {
    expect(sanitizeFilename("../../etc/passwd.svg")).toBe("passwd.svg");
  });

  it("strips directory components from absolute paths", () => {
    expect(sanitizeFilename("/etc/passwd")).toBe("passwd");
  });

  it("strips backslash directory components (Windows-style)", () => {
    expect(sanitizeFilename("..\\..\\foo.svg")).toBe("foo.svg");
  });

  it("replaces filesystem-hostile characters with underscores", () => {
    expect(sanitizeFilename('bad:name"<>|?*.svg')).toBe("bad_name______.svg");
  });

  it("neutralizes shell-injection-style names (quotes + path separators)", () => {
    // Path split takes the last segment; embedded quotes get replaced.
    expect(sanitizeFilename('a"; rm -rf ~/".svg')).toBe("_.svg");
  });

  it("neutralizes embedded double-quotes without a slash", () => {
    expect(sanitizeFilename('a"b.svg')).toBe("a_b.svg");
  });

  it("replaces control characters", () => {
    expect(sanitizeFilename("a\x00b\x1fc.svg")).toBe("a_b_c.svg");
  });

  it("strips leading dots so the file isn't hidden", () => {
    expect(sanitizeFilename("...hidden.svg")).toBe("hidden.svg");
  });

  it("falls back to 'notation' when sanitization empties the name", () => {
    expect(sanitizeFilename("...")).toBe("notation");
  });

  it("falls back to 'notation' for an empty input", () => {
    expect(sanitizeFilename("")).toBe("notation");
  });
});
