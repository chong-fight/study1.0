import fs from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve(import.meta.dirname, "../out");
const aliases = [];

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
    }
  }
}

await walk(outDir);
for (const alias of aliases) {
  await fs.copyFile(alias.source, alias.target);
}

await fs.writeFile(path.join(outDir, ".nojekyll"), "", "utf8");

console.log(`Prepared ${aliases.length} static RSC aliases and .nojekyll.`);
