import fs from "node:fs";
import path from "node:path";

const directory = path.resolve(import.meta.dirname, "../local-data");
const candidates = fs
  .readdirSync(directory)
  .filter(
    (name) =>
      name.endsWith(".json") &&
      (name.includes("固定搭配") || name.includes("动词")),
  );
const enhancedBases = new Set(
  candidates
    .filter((name) => name.includes(".enhanced."))
    .map((name) => name.replace(".enhanced.json", ".json")),
);
const files = candidates.filter((name) => !enhancedBases.has(name));

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
  const base = path.basename(name);
  console.log(
    `${base}: ${phrases.length} rows; missing meaning=${missingMeaning}, example=${missingExample}, translation=${missingTranslation}`,
  );
  if (missingMeaning || missingExample || missingTranslation) failed = true;
}

if (failed) process.exitCode = 1;
