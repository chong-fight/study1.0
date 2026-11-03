import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const outDir = path.resolve(import.meta.dirname, "../out");
const aliases = [];
const outputFiles = [];

async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
    } else if (entry.name === "__PAGE__.txt") {
      const parent = path.dirname(fullPath);
      const dottedParent = path.basename(parent);
      if (dottedParent.startsWith("__next.")) {
        aliases.push({
          source: fullPath,
          target: path.join(
            path.dirname(parent),
            `${dottedParent}.__PAGE__.txt`,
          ),
        });
      }
      outputFiles.push(fullPath);
    } else {
      outputFiles.push(fullPath);
    }
  }
}

await walk(outDir);
for (const alias of aliases) {
  await fs.copyFile(alias.source, alias.target);
}

await fs.writeFile(path.join(outDir, ".nojekyll"), "", "utf8");

const hash = crypto.createHash("sha256");
const swPath = path.join(outDir, "sw.js");
for (const filePath of outputFiles.sort((left, right) =>
  left.localeCompare(right),
)) {
  hash.update(path.relative(outDir, filePath).replaceAll("\\", "/"));
  hash.update(await fs.readFile(filePath));
}
const buildId = (
  process.env.GITHUB_SHA ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  hash.digest("hex")
)
  .replace(/[^a-zA-Z0-9_-]/g, "")
  .slice(0, 20);
const serviceWorker = await fs.readFile(swPath, "utf8");
const versionedServiceWorker = serviceWorker.replaceAll(
  "__BUILD_ID__",
  buildId,
);
if (versionedServiceWorker.includes("__BUILD_ID__")) {
  throw new Error("Service worker build id placeholder was not replaced");
}
await fs.writeFile(swPath, versionedServiceWorker, "utf8");

for (const privatePath of ["local-data", "local-preview", "backup-smoke.json"]) {
  try {
    await fs.access(path.join(outDir, privatePath));
    throw new Error(`Private workspace data leaked into static export: ${privatePath}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.log(
  `Prepared ${aliases.length} static RSC aliases, .nojekyll, and cache ${buildId}.`,
);
