import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeImportJson } from "@/lib/import/normalize";

const outputs = path.resolve(process.cwd(), "../outputs");
const fixedPath = path.join(
  outputs,
  "短词记_固定搭配_增强版_合并专升本.json",
);
const verbPath = path.join(
  outputs,
  "短词记_动词_增强版_合并专升本.json",
);
const missingPath = path.join(
  outputs,
  "短词记_专升本机构词组_缺失清单.json",
);
const fixed127Path = path.join(
  outputs,
  "短词记_专升本127_固定搭配.json",
);
const verb127Path = path.join(
  outputs,
  "短词记_专升本127_动词句型.json",
);
const available = [fixedPath, verbPath, missingPath].every((file) =>
  fs.existsSync(file),
);
const available127 = [fixed127Path, verb127Path].every((file) =>
  fs.existsSync(file),
);

describe.skipIf(!available)("institution vocabulary supplement", () => {
  it("keeps both merged files importable and the missing list at 35", () => {
    const fixed = normalizeImportJson(
      fs.readFileSync(fixedPath, "utf8"),
      "merged-fixed.json",
    );
    const verb = normalizeImportJson(
      fs.readFileSync(verbPath, "utf8"),
      "merged-verb.json",
    );
    const missing = JSON.parse(fs.readFileSync(missingPath, "utf8"));

    expect(fixed.trackId).toBe("fixed");
    expect(fixed.errors).toHaveLength(0);
    expect(fixed.phrases).toHaveLength(577);
    expect(verb.trackId).toBe("verb-pattern");
    expect(verb.errors).toHaveLength(0);
    expect(verb.phrases).toHaveLength(384);
    expect(missing.phrases).toHaveLength(35);
    expect(missing.summary).toEqual({ fixed: 31, verbPattern: 4 });

    for (const item of [...fixed.phrases, ...verb.phrases]) {
      expect(item.exampleVariants?.length).toBeGreaterThanOrEqual(4);
      expect(item.senses?.length).toBeGreaterThan(0);
      expect(
        item.senses?.every(
          (sense) => sense.exampleEn && sense.exampleZh,
        ),
      ).toBe(true);
    }
  });
});

describe.skipIf(!available127)("institution 127-item starter decks", () => {
  it("splits the 127 unique phrases into importable track files", () => {
    const fixed = normalizeImportJson(
      fs.readFileSync(fixed127Path, "utf8"),
      "institution-fixed-127.json",
    );
    const verb = normalizeImportJson(
      fs.readFileSync(verb127Path, "utf8"),
      "institution-verb-127.json",
    );
    expect(fixed.errors).toHaveLength(0);
    expect(verb.errors).toHaveLength(0);
    expect(fixed.phrases).toHaveLength(108);
    expect(verb.phrases).toHaveLength(19);
    expect(fixed.phrases.length + verb.phrases.length).toBe(127);
    expect(
      new Set(
        [...fixed.phrases, ...verb.phrases].map(
          (item) => item.normalizedPhrase,
        ),
      ).size,
    ).toBe(127);
  });
});
