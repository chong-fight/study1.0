import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

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
  {
    file: "短词记_固定搭配.json",
    output: "短词记_固定搭配.enhanced.json",
    kind: "translate",
    batchSize: 30,
  },
  {
    file: "短词记_动词.json",
    output: "短词记_动词.enhanced.json",
    kind: "examples",
    batchSize: 18,
  },
];

await fs.mkdir(cacheDir, { recursive: true });

for (const source of sources) {
  await enrichLibrary(source);
}

async function enrichLibrary(job) {
  const sourcePath = path.join(dataDir, job.file);
  const outputPath = path.join(dataDir, job.output);
  const document = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const phrases = document.phrases || [];
  const cachePath = path.join(
    cacheDir,
    `${path.parse(job.file).name}.${job.kind}.json`,
  );
  const cache = await readJson(cachePath, {});
  await migrateLegacyKeys(cache, phrases, job.batchSize);
  const batches = chunk(phrases, job.batchSize);

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const batchKey = String(index);
    const currentBatch = cache[batchKey] || {};
    const missingIndexes = batch
      .map((phrase) => ({ phrase }))
      .filter(({ phrase }) => !isItemComplete(currentBatch[getItemKey(phrase)], job.kind));
    if (missingIndexes.length === 0) {
      process.stdout.write(
        `${job.file}: batch ${index + 1}/${batches.length} cached\n`,
      );
      continue;
    }

    const missingBatch = missingIndexes.map(({ phrase }) => phrase);
    const result = await retry(
      () =>
        job.kind === "translate"
          ? translateBatch(missingBatch)
          : generateExamplesBatch(missingBatch),
      4,
    );
    cache[batchKey] = { ...currentBatch, ...result };
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
    process.stdout.write(
      `${job.file}: batch ${index + 1}/${batches.length} complete\n`,
    );
  }

  const enriched = phrases.map((phrase, index) => {
    const batchIndex = Math.floor(index / job.batchSize);
    const key = getItemKey(phrase);
    const item = cache[String(batchIndex)]?.[key];
    if (!item) return phrase;
    if (job.kind === "translate") {
      return {
        ...phrase,
        exampleZh: item.exampleZh,
      };
    }
    return {
      ...phrase,
      example: item.exampleEn,
      exampleZh: item.exampleZh,
      supportsCloze: false,
    };
  });

  enriched.forEach((phrase) => {
    if (!phrase.exampleZh) {
      throw new Error(`Missing Chinese translation: ${phrase.phrase}`);
    }
    if (job.kind === "examples" && !phrase.example) {
      throw new Error(`Missing example: ${phrase.phrase}`);
    }
  });

  const output = {
    ...document,
    metadata: {
      ...document.metadata,
      contentEnrichment: {
        generatedAt: new Date().toISOString(),
        model,
        task: job.kind,
        originalFile: job.file,
      },
    },
    phrases: enriched,
  };
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  process.stdout.write(`${job.file}: wrote ${job.output}\n`);
}

async function translateBatch(batch) {
  const items = batch.map((phrase) => ({
    key: getItemKey(phrase),
    phrase: phrase.phrase,
    meaning: phrase.meaning,
    example: phrase.example,
  }));
  const response = await callModel(
    [
      "You are a professional English-to-Simplified-Chinese lexicographer.",
      "Translate each English example into natural, concise Simplified Chinese.",
      "Use the phrase meaning to resolve ambiguity. Return JSON only.",
      'Output shape: {"items":[{"key":"...","exampleZh":"..."}]}',
    ].join(" "),
    JSON.stringify({ items }),
    6000,
  );
  const parsed = parseJsonResponse(response);
  return Object.fromEntries(
    parsed.items
      .filter((item) => item.key && hasChinese(item.exampleZh))
      .map((item) => [item.key, { exampleZh: String(item.exampleZh).trim() }]),
  );
}

async function generateExamplesBatch(batch) {
  const items = batch.map((phrase) => ({
    key: getItemKey(phrase),
    phrase: phrase.phrase,
    meaning: phrase.meaning,
    entryType: phrase.entryType,
    category: phrase.category,
  }));
  const response = await callModel(
    [
      "You are writing examples for a Chinese learner of English.",
      "For each English verb pattern, write one natural English sentence that correctly demonstrates the target structure.",
      "Replace sb./sth. placeholders with concrete people or things. Keep the target grammar pattern unchanged in spirit.",
      "Then provide a natural Simplified Chinese translation. Return JSON only.",
      'Output shape: {"items":[{"key":"...","exampleEn":"...","exampleZh":"..."}]}',
    ].join(" "),
    JSON.stringify({ items }),
    7000,
  );
  const parsed = parseJsonResponse(response);
  return Object.fromEntries(
    parsed.items
      .filter(
        (item) =>
          item.key &&
          String(item.exampleEn || "").trim() &&
          hasChinese(item.exampleZh),
      )
      .map((item) => [
        item.key,
        {
          exampleEn: String(item.exampleEn).trim(),
          exampleZh: String(item.exampleZh).trim(),
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
      temperature: 0.2,
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

function getItemKey(phrase) {
  return crypto
    .createHash("sha1")
    .update(`${phrase.id || ""}:${phrase.phrase}`)
    .digest("hex")
    .slice(0, 12);
}

function isItemComplete(value, kind) {
  if (!value || typeof value !== "object") return false;
  return kind === "translate"
    ? hasChinese(value.exampleZh)
    : Boolean(value.exampleEn && hasChinese(value.exampleZh));
}

async function migrateLegacyKeys(cache, phrases, batchSize) {
  const batches = chunk(phrases, batchSize);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const key = String(batchIndex);
    const batch = batches[batchIndex];
    const existing = cache[key] || {};
    const migrated = { ...existing };
    batch.forEach((phrase, localIndex) => {
      const legacyKey = crypto
        .createHash("sha1")
        .update(`${phrase.id || ""}:${phrase.phrase}:${localIndex}`)
        .digest("hex")
        .slice(0, 12);
      if (existing[legacyKey] && !existing[getItemKey(phrase)]) {
        migrated[getItemKey(phrase)] = existing[legacyKey];
      }
    });
    cache[key] = migrated;
  }
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
        `attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : error}\n`,
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
