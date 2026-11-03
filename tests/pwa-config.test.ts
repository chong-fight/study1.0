import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("PWA release configuration", () => {
  it("limits cache cleanup to the application namespace", async () => {
    const source = await fs.readFile(
      path.join(projectRoot, "public", "sw.js"),
      "utf8",
    );

    expect(source).toContain('const CACHE_PREFIX = "phrase-memory-2-";');
    expect(source).toContain("key.startsWith(CACHE_PREFIX)");
    expect(source).toContain("__BUILD_ID__");
  });

  it("stamps the cache name during static export preparation", async () => {
    const source = await fs.readFile(
      path.join(projectRoot, "scripts", "prepare-static-export.mjs"),
      "utf8",
    );

    expect(source).toContain('"__BUILD_ID__"');
    expect(source).toContain("buildId");
    expect(source).toContain('process.env.GITHUB_SHA');
    expect(source).toContain('path.join(outDir, "sw.js")');
  });
});
