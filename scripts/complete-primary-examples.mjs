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

for (const file of [
  "短词记_固定搭配.enhanced.json",
  "短词记_动词.enhanced.json",
]) {
  await completeFile(file);
}

async function completeFile(file) {
  const sourcePath = path.join(dataDir, file);
  const outputPath = path.join(
    dataDir,
    file.replace(".enhanced.json", ".primary-complete.json"),
  );
  const document = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const cachePath = path.join(
    cacheDir,
    `${path.parse(file).name}.primary-completion.json`,
  );
  const cache = await readJson(cachePath, {});

  const requests = [];
  for (const row of document.phrases ?? []) {
    const missing = Math.max(0, 4 - (row.primaryExampleIndexes?.length ?? 0));
    for (let index = 0; index < missing; index += 1) {
      requests.push({
        key: `${getItemKey(row)}:${index}`,
        row,
      });
    }
  }

  for (const batch of chunk(requests, 20)) {
    const missing = batch.filter((item) => !isComplete(cache[item.key]));
    if (missing.length === 0) continue;
    const generated = await retry(() => generateBatch(missing), 3);
    Object.assign(cache, generated);
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
  }

  const rows = document.phrases.map((row) => {
    const primaryIndexes = [...(row.primaryExampleIndexes ?? [])];
    const exampleVariants = [...(row.exampleVariants ?? [])];
    const needed = Math.max(0, 4 - primaryIndexes.length);
    for (let index = 0; index < needed; index += 1) {
      const generated = cache[`${getItemKey(row)}:${index}`];
      if (!generated) {
        throw new Error(`Missing primary example for ${row.phrase}`);
      }
      primaryIndexes.push(exampleVariants.length);
      exampleVariants.push({
        exampleEn: generated.exampleEn,
        exampleZh: generated.exampleZh,
      });
    }
    return {
      ...row,
      primaryExampleIndexes: primaryIndexes,
      exampleVariants,
    };
  });

  const output = {
    ...document,
    metadata: {
      ...document.metadata,
      primaryExampleCompletion: {
        completedAt: new Date().toISOString(),
        generatedExamples: requests.length,
      },
    },
    phrases: rows,
  };
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  process.stdout.write(
    `${file}: generated ${requests.length} primary examples, wrote ${path.basename(outputPath)}\n`,
  );
}

async function generateBatch(items) {
  const payload = items.map((item) => ({
    key: item.key,
    phrase: item.row.phrase,
    primaryMeaning: item.row.senses[0].meaning,
    otherMeanings: item.row.senses.slice(1).map((sense) => sense.meaning),
    disallowedExamples: [
      ...(item.row.exampleVariants ?? []).map((example) => example.exampleEn),
      ...(item.row.senses ?? []).flatMap((sense) =>
        sense.exampleEn ? [sense.exampleEn] : [],
      ),
    ],
  }));
  const response = await callModel(
    [
      "Write one natural English example and Simplified Chinese translation for each item.",
      "Each sentence must clearly demonstrate ONLY primaryMeaning, not any otherMeaning.",
      "Do not duplicate or paraphrase any disallowedExample.",
      "Use concrete context and vary the situation between items.",
      "Return JSON only with shape:",
      '{"items":[{"key":"...","exampleEn":"...","exampleZh":"..."}]}',
    ].join(" "),
    JSON.stringify({ items: payload }),
    8000,
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
          exampleEn: String(item.exampleEn).replace(/\s+/g, " ").trim(),
          exampleZh: String(item.exampleZh).replace(/\s+/g, " ").trim(),
        },
      ]),
  );
}

function isComplete(value) {
  return Boolean(
    value?.exampleEn &&
      String(value.exampleEn).trim() &&
      hasChinese(value.exampleZh),
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
      temperature: 0.55,
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
