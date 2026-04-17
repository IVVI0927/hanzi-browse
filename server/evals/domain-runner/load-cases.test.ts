import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadGoldenFile } from "./load-cases.js";

describe("loadGoldenFile", () => {
  it("parses a minimal valid file", () => {
    const dir = mkdtempSync(join(tmpdir(), "gold-"));
    const path = join(dir, "x.com.yaml");
    writeFileSync(
      path,
      `
domain: x.com
cases:
  - id: read-profile
    task: "Open @sama profile and return the bio"
    url: "https://x.com/sama"
    success_check:
      type: agent_answer_contains
      substring: "OpenAI"
`
    );
    const gf = loadGoldenFile(path);
    expect(gf.domain).toBe("x.com");
    expect(gf.cases).toHaveLength(1);
    expect(gf.cases[0].id).toBe("read-profile");
    expect(gf.cases[0].success_check.type).toBe("agent_answer_contains");
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a file missing `domain`", () => {
    const dir = mkdtempSync(join(tmpdir(), "gold-"));
    const path = join(dir, "bad.yaml");
    writeFileSync(path, `cases: []`);
    expect(() => loadGoldenFile(path)).toThrow(/domain/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a case missing `success_check`", () => {
    const dir = mkdtempSync(join(tmpdir(), "gold-"));
    const path = join(dir, "bad2.yaml");
    writeFileSync(
      path,
      `
domain: x.com
cases:
  - id: broken
    task: "do a thing"
`
    );
    expect(() => loadGoldenFile(path)).toThrow(/success_check/);
    rmSync(dir, { recursive: true, force: true });
  });
});
