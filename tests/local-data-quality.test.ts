import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildContextPrompt } from "@/lib/domain/review-flow";
import { normalizeImportJson } from "@/lib/import/normalize";

const dataDir = path.resolve(process.cwd(), "local-data");
const files = [
  "短词记_固定搭配.enhanced.json",
  "短词记_动词.enhanced.json",
].filter((name) => fs.existsSync(path.join(dataDir, name)));

describe.skipIf(files.length === 0)("local vocabulary quality", () => {
  it("has a distinct, translated and usable quiz example for every row", () => {
    for (const file of files) {
      const text = fs.readFileSync(path.join(dataDir, file), "utf8");
      const preview = normalizeImportJson(text, file);
      const missingQuizExamples = preview.phrases.filter(
        (item) => !item.quizExampleEn,
      );
      const missingQuizTranslations = preview.phrases.filter(
        (item) => !/[\u3400-\u9fff]/.test(item.quizExampleZh ?? ""),
      );
      const reusedExamples = preview.phrases.filter(
        (item) =>
          item.quizExampleEn?.trim().toLowerCase() ===
          item.exampleEn.trim().toLowerCase(),
      );
      const unusableContexts = preview.phrases.filter(
        (item) => !buildContextPrompt(item),
      );
      const invalidVariantCounts = preview.phrases.filter(
        (item) => (item.exampleVariants?.length ?? 0) < 4,
      );
      const duplicateVariants = preview.phrases.filter((item) => {
        const values =
          item.exampleVariants?.map((example) =>
            example.exampleEn.trim().toLowerCase(),
          ) ?? [];
        return new Set(values).size !== values.length;
      });
      const unusableVariantContexts = preview.phrases.flatMap((item) =>
        (item.exampleVariants ?? [])
          .map((example, index) => ({
            phrase: item.phrase,
            index,
            example,
            prompt: buildContextPrompt(item, index),
          }))
          .filter((item) => !item.prompt),
      );
      const invalidSenses = preview.phrases.filter(
        (item) =>
          !item.senses?.length ||
          item.senses[0].meaning !== item.meaning ||
          item.senses.some(
            (sense) =>
              !/[\u3400-\u9fff]/.test(sense.meaning) ||
              !sense.exampleEn ||
              !/[\u3400-\u9fff]/.test(sense.exampleZh ?? ""),
          ) ||
          new Set(item.senses.map((sense) => sense.meaning)).size !==
            item.senses.length ||
          new Set(item.senses.map((sense) => sense.exampleEn)).size !==
            item.senses.length ||
          !item.primaryExampleIndexes?.length ||
          item.primaryExampleIndexes.some(
            (index) => !item.exampleVariants?.[index],
          ),
      );
      expect(missingQuizExamples, `${file} quiz examples`).toHaveLength(0);
      expect(
        missingQuizTranslations,
        `${file} quiz translations`,
      ).toHaveLength(0);
      expect(reusedExamples, `${file} reused examples`).toHaveLength(0);
      expect(unusableContexts, `${file} blankable contexts`).toHaveLength(0);
      expect(invalidVariantCounts, `${file} four variants`).toHaveLength(0);
      expect(duplicateVariants, `${file} duplicate variants`).toHaveLength(0);
      expect(
        unusableVariantContexts,
        `${file} blankable variants`,
      ).toHaveLength(0);
      expect(invalidSenses, `${file} meaning senses`).toHaveLength(0);
    }
  });
});
