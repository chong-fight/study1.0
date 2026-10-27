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
const batchSize = 20;

await fs.mkdir(cacheDir, { recursive: true });

for (const file of sources) {
  await generateForFile(file);
}

async function generateForFile(file) {
  const sourcePath = path.join(dataDir, file);
  const outputPath = path.join(
    dataDir,
    file.replace(".enhanced.json", ".quiz-enhanced.json"),
  );
  const document = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const rows = document.phrases || [];
  const cachePath = path.join(
    cacheDir,
    `${path.parse(file).name}.quiz-examples.json`,
  );
  const cache = await readJson(cachePath, {});
  const batches = chunk(rows, batchSize);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const batchKey = String(index);
    const currentBatch = cache[batchKey] || {};
    let missing = batch.filter(
      (row) => !isComplete(currentBatch[getItemKey(row)], row),
    );
    if (missing.length === 0) {
      process.stdout.write(`${file}: batch ${index + 1}/${batches.length} cached\n`);
      continue;
    }

    for (let pass = 1; pass <= 3 && missing.length > 0; pass += 1) {
      const result = await retry(() => generateBatch(missing), 4);
      cache[batchKey] = { ...cache[batchKey], ...result };
      await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
      missing = batch.filter(
        (row) => !isComplete(cache[batchKey]?.[getItemKey(row)], row),
      );
    }
    if (missing.length > 0) {
      throw new Error(
        `${file}: ${missing.length} rows still missing after retries: ${missing
          .slice(0, 5)
          .map((row) => row.phrase)
          .join(", ")}`,
      );
    }
    process.stdout.write(`${file}: batch ${index + 1}/${batches.length} complete\n`);
  }

  const enriched = rows.map((row, index) => {
    const item = cache[String(Math.floor(index / batchSize))]?.[getItemKey(row)];
    if (!item) return row;
    return {
      ...row,
      quizExampleEn: item.quizExampleEn,
      quizExampleZh: item.quizExampleZh,
    };
  });
  const missing = enriched.filter(
    (row) => !isComplete(row, row),
  );
  if (missing.length > 0) {
    throw new Error(`${file}: ${missing.length} rows missing quiz examples`);
  }

  const output = {
    ...document,
    metadata: {
      ...document.metadata,
      quizExamples: {
        generatedAt: new Date().toISOString(),
        model,
        count: enriched.length,
      },
    },
    phrases: enriched,
  };
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  process.stdout.write(`${file}: wrote ${path.basename(outputPath)}\n`);
}

async function generateBatch(batch) {
  const items = batch.map((row) => ({
    key: getItemKey(row),
    phrase: row.phrase,
    meaning: row.meaning,
    entryType: row.entryType,
    category: row.category,
    originalExample: row.example || row.exampleEn,
  }));
  const response = await callModel(
    [
      "You write high-quality retrieval-practice examples for Chinese learners of English.",
      "For every item, write one NEW natural English sentence that demonstrates the target phrase or verb pattern.",
      "The new sentence must use a different situation, subject and wording from originalExample.",
      "Replace sb./sth. with concrete people or things while preserving the intended grammar pattern.",
      "Translate the new sentence into natural concise Simplified Chinese.",
      "Return JSON only with shape:",
      '{"items":[{"key":"...","quizExampleEn":"...","quizExampleZh":"..."}]}',
    ].join(" "),
    JSON.stringify({ items }),
    8000,
  );
  const parsed = parseJsonResponse(response);
  return Object.fromEntries(
    parsed.items
      .filter((item) => item.key && String(item.quizExampleEn || "").trim() && hasChinese(item.quizExampleZh))
      .map((item) => [
        item.key,
        {
          quizExampleEn: String(item.quizExampleEn).replace(/\s+/g, " ").trim(),
          quizExampleZh: String(item.quizExampleZh).replace(/\s+/g, " ").trim(),
        },
      ]),
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
      temperature: 0.65,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok) {
    throw new Error(`Model request failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  }
  const payload = await response.json();
  const text = payload.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  if (!text) throw new Error("Model returned no text");
  return text;
}

function isComplete(item, row) {
  const next = String(item?.quizExampleEn || "").replace(/\s+/g, " ").trim();
  const translation = String(item?.quizExampleZh || "").trim();
  const original = String(row?.example || row?.exampleEn || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return Boolean(next && translation && next.toLowerCase() !== original && !next.toLowerCase().includes(original));
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
        `attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : error.message}\n`,
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
