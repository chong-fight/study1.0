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
const batchSize = 15;

await fs.mkdir(cacheDir, { recursive: true });

for (const file of sources) {
  await generateForFile(file);
}

async function generateForFile(file) {
  const sourcePath = path.join(dataDir, file);
  const outputPath = path.join(
    dataDir,
    file.replace(".enhanced.json", ".senses-enhanced.json"),
  );
  const document = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const rows = document.phrases || [];
  const cachePath = path.join(
    cacheDir,
    `${path.parse(file).name}.senses.json`,
  );
  const cache = await readJson(cachePath, {});
  const batches = chunk(rows, batchSize);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const batchKey = String(index);
    const currentBatch = cache[batchKey] || {};
    let missing = batch.filter(
      (row) => !isComplete(currentBatch[getItemKey(row)]),
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
        (row) => !isComplete(cache[batchKey]?.[getItemKey(row)]),
      );
    }
    if (missing.length > 0) {
      throw new Error(
        `${file}: ${missing.length} rows still missing senses: ${missing
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
    const senses = item.senses.map((sense, senseIndex) => ({
      meaning: sense.meaning,
      note: sense.note,
      primary: senseIndex === 0,
    }));
    return {
      ...row,
      meaning: item.senses[0].meaning,
      senses,
    };
  });

  const output = {
    ...document,
    metadata: {
      ...document.metadata,
      meaningSenses: {
        generatedAt: new Date().toISOString(),
        model,
        phrases: enriched.length,
        multiSensePhrases: enriched.filter((row) => row.senses.length > 1).length,
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
    existingMeaning: row.meaning,
    examples: (row.exampleVariants ?? []).map((item) => item.exampleEn),
    entryType: row.entryType,
    category: row.category,
  }));
  const response = await callModel(
    [
      "You are a bilingual English-Chinese lexicographer working for Chinese learners of English.",
      "For each phrase, identify the genuinely common Simplified Chinese senses a learner should know.",
      "The FIRST sense must be the single most common concise meaning that best matches the supplied examples. It must be Chinese and must not combine unrelated senses with semicolons.",
      "Add only real lexical or usage senses, up to four total. Do not list mere paraphrases, grammatical labels, literal translations that are not used, or rare invented meanings.",
      "For additional senses, write a very short Chinese note explaining when that sense is used.",
      "Return JSON only with shape:",
      '{"items":[{"key":"...","senses":[{"meaning":"...","note":"..."}]}]}',
    ].join(" "),
    JSON.stringify({ items }),
    7000,
  );
  const parsed = parseJsonResponse(response);
  return Object.fromEntries(
    parsed.items
      .filter((item) => item.key && normalizeAndValidateSenses(item.senses))
      .map((item) => [
        item.key,
        { senses: normalizeAndValidateSenses(item.senses) },
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
      temperature: 0.15,
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

function normalizeAndValidateSenses(value) {
  if (!Array.isArray(value)) return null;
  const result = [];
  const seen = new Set();
  for (const item of value.slice(0, 4)) {
    if (!item || typeof item !== "object") continue;
    const meaning = String(item.meaning || "").replace(/\s+/g, " ").trim();
    const note = String(item.note || "").replace(/\s+/g, " ").trim();
    if (!hasChinese(meaning) || meaning.length > 36) continue;
    if ((meaning.match(/[；;]/g) ?? []).length > 1) continue;
    if (seen.has(meaning)) continue;
    seen.add(meaning);
    result.push({ meaning, note: hasChinese(note) ? note.slice(0, 48) : "" });
  }
  return result.length > 0 ? result : null;
}

function isComplete(item) {
  const senses = normalizeAndValidateSenses(item?.senses);
  return Boolean(senses && senses.length === item.senses.length);
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
