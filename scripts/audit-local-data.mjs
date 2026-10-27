import fs from "node:fs";
import path from "node:path";

const directory = path.resolve(import.meta.dirname, "../local-data");
const candidates = fs
  .readdirSync(directory)
  .filter(
    (name) =>
      name.endsWith(".enhanced.json") &&
      (name.includes("固定搭配") || name.includes("动词")),
  );
const files = candidates;

if (files.length === 0) {
  console.log("No local vocabulary files found.");
  process.exit(0);
}

let failed = false;
for (const name of files) {
  const document = JSON.parse(
    fs.readFileSync(path.join(directory, name), "utf8"),
  );
  const phrases = document.phrases ?? [];
  const missingMeaning = phrases.filter((item) => !item.meaning?.trim()).length;
  const missingExample = phrases.filter((item) => !item.example?.trim()).length;
  const missingTranslation = phrases.filter(
    (item) => !/[\u3400-\u9fff]/.test(item.exampleZh ?? ""),
  ).length;
  const missingQuizExample = phrases.filter(
    (item) => !item.quizExampleEn?.trim(),
  ).length;
  const missingQuizTranslation = phrases.filter(
    (item) => !/[\u3400-\u9fff]/.test(item.quizExampleZh ?? ""),
  ).length;
  const reusedQuizExample = phrases.filter(
    (item) =>
      item.quizExampleEn?.trim().toLowerCase() ===
      String(item.example || item.exampleEn || "").trim().toLowerCase(),
  ).length;
  const invalidVariantCounts = phrases.filter(
    (item) => !Array.isArray(item.exampleVariants) || item.exampleVariants.length < 4,
  ).length;
  const duplicateVariants = phrases.filter((item) => {
    const values = (item.exampleVariants ?? []).map((example) =>
      String(example.exampleEn || "").trim().toLowerCase(),
    );
    return new Set(values).size !== values.length;
  }).length;
  const invalidSenses = phrases.filter(
    (item) =>
      !Array.isArray(item.senses) ||
      item.senses.length === 0 ||
      item.senses.some(
        (sense) =>
          !/[\u3400-\u9fff]/.test(sense.meaning ?? "") ||
          !sense.meaning?.trim() ||
          !sense.exampleEn ||
          !/[\u3400-\u9fff]/.test(sense.exampleZh ?? ""),
      ) ||
      new Set(
        (item.senses ?? []).map((sense) =>
          String(sense.meaning || "").trim(),
        ),
      ).size !== (item.senses ?? []).length ||
      !item.primaryExampleIndexes?.length ||
      item.primaryExampleIndexes.some(
        (index) => !item.exampleVariants?.[index],
      ),
  ).length;
  const multiSenseRows = phrases.filter(
    (item) => (item.senses ?? []).length > 1,
  ).length;
  const base = path.basename(name);
  console.log(
    `${base}: ${phrases.length} rows; missing meaning=${missingMeaning}, example=${missingExample}, translation=${missingTranslation}, quizExample=${missingQuizExample}, quizTranslation=${missingQuizTranslation}, reusedQuizExample=${reusedQuizExample}, variantPools=${invalidVariantCounts}, duplicateVariants=${duplicateVariants}, invalidSenses=${invalidSenses}, multiSenseRows=${multiSenseRows}`,
  );
  if (
    missingMeaning ||
    missingExample ||
    missingTranslation ||
    missingQuizExample ||
    missingQuizTranslation ||
    reusedQuizExample ||
    invalidVariantCounts ||
    duplicateVariants ||
    invalidSenses
  ) {
    failed = true;
  }
}

if (failed) process.exitCode = 1;
