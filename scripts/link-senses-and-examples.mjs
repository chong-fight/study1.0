import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, "local-data");
const cacheDir = path.join(dataDir, ".enrichment-cache");
const baseUrl = process.env.ANTHROPIC_BASE_URL?.replace(/\/$/, "");
const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
const model = process.env.ANTHROPIC_MODEL || "deepseek-chat";

if (!baseUrl || !authToken) {
  throw new Error("ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN are required");
}

const sources = [
  "短词记_固定搭配.enhanced.json",
  "短词记_动词.enhanced.json",
];

for (const file of sources) {
  await linkFile(file);
}

async function linkFile(file) {
  const sourcePath = path.join(dataDir, file);
  const outputPath = path.join(
    dataDir,
    file.replace(".enhanced.json", ".senses-linked.json"),
  );
  const document = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const rows = document.phrases || [];
  const multiSenseRows = rows.filter((row) => row.senses?.length > 1);
  const cachePath = path.join(
    cacheDir,
    `${path.parse(file).name}.sense-classification.json`,
  );
  const cache = await readJson(cachePath, {});

  for (const [batchIndex, batch] of chunk(multiSenseRows, 20).entries()) {
    let missing = batch.filter(
      (row) => !isCompleteClassification(cache[getItemKey(row)], row),
    );
    for (let attempt = 1; attempt <= 4 && missing.length > 0; attempt += 1) {
      const generated = await retry(() => classifyBatch(missing), 3);
      Object.assign(cache, generated);
      await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
      missing = batch.filter(
        (row) => !isCompleteClassification(cache[getItemKey(row)], row),
      );
    }
    if (missing.length > 0) {
      throw new Error(
        `${file}: classification failed for ${missing.map((row) => row.phrase).join(", ")}`,
      );
    }
    process.stdout.write(
      `${file}: classification batch ${batchIndex + 1}/${Math.ceil(multiSenseRows.length / 20)}\n`,
    );
  }

  const linkedRows = rows.map((row) => {
    if (row.senses.length === 1) {
      return {
        ...row,
        primaryExampleIndexes: [0, 1, 2, 3],
        senses: [
          {
            ...row.senses[0],
            exampleEn: row.exampleVariants?.[0]?.exampleEn,
            exampleZh: row.exampleVariants?.[0]?.exampleZh,
          },
        ],
      };
    }
    const classification = cache[getItemKey(row)];
    const indexesBySense = row.senses.map((_, senseIndex) =>
      classification.exampleSenseIndexes
        .map((value, exampleIndex) => ({ value, exampleIndex }))
        .filter((item) => item.value === senseIndex)
        .map((item) => item.exampleIndex),
    );
    return {
      ...row,
      primaryExampleIndexes: indexesBySense[0],
      senses: row.senses.map((sense, senseIndex) => {
        const exampleIndex = indexesBySense[senseIndex][0];
        const example = row.exampleVariants[exampleIndex];
        return {
          ...sense,
          exampleEn: example?.exampleEn,
          exampleZh: example?.exampleZh,
        };
      }),
    };
  });

  await fillMissingExamples(linkedRows, cachePath.replace(".sense-classification.json", ".sense-example-fill.json"));

  const invalid = linkedRows.filter(
    (row) =>
      !row.primaryExampleIndexes?.length ||
      row.senses.some(
        (sense) => !sense.exampleEn || !hasChinese(sense.exampleZh),
      ),
  );
  if (invalid.length > 0) {
    throw new Error(
      `${file}: ${invalid.length} rows lack a primary or sense-linked example`,
    );
  }

  const output = {
    ...document,
    metadata: {
      ...document.metadata,
      senseClassification: {
        completedAt: new Date().toISOString(),
        multiSensePhrases: multiSenseRows.length,
      },
    },
    phrases: linkedRows,
  };
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  process.stdout.write(`${file}: wrote ${path.basename(outputPath)}\n`);
}

async function fillMissingExamples(rows, cachePath) {
  const cache = await readJson(cachePath, {});
  const missing = [];
  for (const row of rows) {
    if (!row.primaryExampleIndexes?.length) {
      missing.push({
        key: `${getItemKey(row)}:0`,
        row,
        senseIndex: 0,
        meaning: row.senses[0].meaning,
      });
    }
    for (const [senseIndex, sense] of row.senses.entries()) {
      if (senseIndex === 0 || sense.exampleEn) continue;
      missing.push({
        key: `${getItemKey(row)}:${senseIndex}`,
        row,
        senseIndex,
        meaning: sense.meaning,
      });
    }
  }

  for (const batch of chunk(missing, 20)) {
    const absent = batch.filter((item) => !isGeneratedExample(cache[item.key]));
    if (absent.length > 0) {
      const generated = await retry(() => generateMissingExamples(absent), 3);
      Object.assign(cache, generated);
      await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
    }
  }

  for (const row of rows) {
    const primary = cache[`${getItemKey(row)}:0`];
    if (primary) {
      const index = row.exampleVariants.length;
      row.exampleVariants.push({
        exampleEn: primary.exampleEn,
        exampleZh: primary.exampleZh,
      });
      row.primaryExampleIndexes = [index];
    }
    for (const [senseIndex, sense] of row.senses.entries()) {
      if (senseIndex === 0) {
        if (primary) {
          sense.exampleEn = primary.exampleEn;
          sense.exampleZh = primary.exampleZh;
        }
        continue;
      }
      const generated = cache[`${getItemKey(row)}:${senseIndex}`];
      if (generated) {
        sense.exampleEn = generated.exampleEn;
        sense.exampleZh = generated.exampleZh;
      }
    }
  }

  const unresolved = rows.flatMap((row) => {
    const indexes = [];
    if (!row.primaryExampleIndexes?.length) indexes.push(`${row.phrase}:primary`);
    row.senses.forEach((sense, senseIndex) => {
      if (!sense.exampleEn) indexes.push(`${row.phrase}:${senseIndex}`);
    });
    return indexes;
  });
  if (unresolved.length > 0) {
    throw new Error(`Unresolved sense examples: ${unresolved.slice(0, 10).join(", ")}`);
  }
}

async function generateMissingExamples(items) {
  const payload = items.map((item) => ({
    key: item.key,
    phrase: item.row.phrase,
    primaryMeaning: item.row.senses[0].meaning,
    senseIndex: item.senseIndex,
    meaning: item.meaning,
  }));
  const response = await callModel(
    [
      "Write one natural English example and Simplified Chinese translation for each target dictionary sense.",
      "The sentence must clearly demonstrate the supplied meaning and use the target phrase naturally.",
      "If senseIndex is 0, it is the primary sense. If greater than 0, it is a secondary sense.",
      "Return JSON only with shape:",
      '{"items":[{"key":"...","exampleEn":"...","exampleZh":"..."}]}',
    ].join(" "),
    JSON.stringify({ items: payload }),
    7000,
  );
  const parsed = parseJsonResponse(response);
  const result = {};
  for (const item of parsed.items ?? []) {
    if (
      item.key &&
      String(item.exampleEn || "").trim() &&
      hasChinese(item.exampleZh)
    ) {
      result[item.key] = {
        exampleEn: String(item.exampleEn).replace(/\s+/g, " ").trim(),
        exampleZh: String(item.exampleZh).replace(/\s+/g, " ").trim(),
      };
    }
  }
  return result;
}

function isGeneratedExample(value) {
  return Boolean(
    value?.exampleEn &&
      String(value.exampleEn).trim() &&
      hasChinese(value.exampleZh),
  );
}

async function classifyBatch(rows) {
  const items = rows.map((row) => ({
    key: getItemKey(row),
    phrase: row.phrase,
    senses: row.senses.map((sense, senseIndex) => ({
      senseIndex,
      meaning: sense.meaning,
      note: sense.note,
    })),
    examples: row.exampleVariants.map((example, index) => ({
      index,
      exampleEn: example.exampleEn,
      exampleZh: example.exampleZh,
    })),
  }));
  const response = await callModel(
    [
      "Classify each English example into exactly one Chinese dictionary sense.",
      "Use the example meaning, not keyword matching.",
      "Return one senseIndex for every example in the same order.",
      "Every supplied item has at least two senses. All four example positions must be present.",
      "Return JSON only with shape:",
      '{"items":[{"key":"...","exampleSenseIndexes":[0,1,0,0]}]}',
    ].join(" "),
    JSON.stringify({ items }),
    6000,
  );
  const parsed = parseJsonResponse(response);
  return Object.fromEntries(
    parsed.items
      .filter((item) => item.key && Array.isArray(item.exampleSenseIndexes))
      .map((item) => {
        const row = rows.find((candidate) => getItemKey(candidate) === item.key);
        if (!row) return null;
        const exampleSenseIndexes = item.exampleSenseIndexes
          .slice(0, 4)
          .map((value) => Number(value))
          .map((value) =>
            Number.isInteger(value) && value >= 0 && value < row.senses.length
              ? value
              : 0,
          );
        while (exampleSenseIndexes.length < 4) exampleSenseIndexes.push(0);
        return [item.key, { exampleSenseIndexes }];
      })
      .filter(Boolean),
  );
}

function isCompleteClassification(value, row) {
  return (
    Array.isArray(value?.exampleSenseIndexes) &&
    value.exampleSenseIndexes.length === 4 &&
    value.exampleSenseIndexes.every(
      (index) =>
        Number.isInteger(index) && index >= 0 && index < row.senses.length,
    ) &&
    value.exampleSenseIndexes.every(
      (_, index) =>
        row.senses.some(
          (__, senseIndex) =>
            value.exampleSenseIndexes[index] === senseIndex,
        ),
    )
  );
}

async function callModel(system, user, maxTokens) {
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": authToken,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.1,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Model request failed (${response.status}): ${(await response.text()).slice(0, 400)}`,
    );
  }
  const payload = await response.json();
  const text = payload.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  if (!text) throw new Error("Model returned no text");
  return text;
}

function parseJsonResponse(value) {
  const stripped = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Invalid JSON response");
    return JSON.parse(stripped.slice(start, end + 1));
  }
}

function hasChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function getItemKey(row) {
  return crypto
    .createHash("sha1")
    .update(`${row.id || ""}:${row.phrase}`)
    .digest("hex")
    .slice(0, 12);
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function retry(task, attempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      process.stderr.write(
        `attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(8000, attempt * 1200)),
      );
    }
  }
  throw lastError;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}
