import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const projectRoot = process.cwd();
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "phrase-memory-pwa-"),
);
const buildA = path.join(temporaryRoot, "build-a");
const buildB = path.join(temporaryRoot, "build-b");
const port = 4180;
const baseURL = `http://127.0.0.1:${port}/`;

function buildTo(destination, buildId) {
  const command =
    process.platform === "win32"
      ? { file: "cmd.exe", args: ["/d", "/s", "/c", "npm run build"] }
      : { file: "sh", args: ["-c", "npm run build"] };
  execFileSync(command.file, command.args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      NEXT_PUBLIC_BASE_PATH: "",
      NEXT_PUBLIC_BUILD_ID: buildId,
    },
    stdio: "inherit",
  });
  fs.cpSync(path.join(projectRoot, "out"), destination, {
    recursive: true,
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry while the static server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Static server did not start: ${url}`);
}

function startServer(staticRoot) {
  return spawn(process.execPath, ["scripts/serve-static.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      STATIC_ROOT: staticRoot,
      NEXT_PUBLIC_BASE_PATH: "",
    },
    stdio: "ignore",
  });
}

async function stopServer(server) {
  if (!server || server.killed) return;
  server.kill();
  await new Promise((resolve) => setTimeout(resolve, 300));
}

let server;
let browser;
try {
  buildTo(buildA, "e2e-cache-a");
  server = startServer(buildA);
  await waitForServer(baseURL);

  browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32" ? { channel: "msedge" } : {}),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const unrelated = await caches.open("other-project-v1");
    await unrelated.put("/other-project-marker", new Response("keep"));
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const firstCaches = await page.evaluate(() => caches.keys());
  const firstAppCache = firstCaches.find((key) =>
    key.startsWith("phrase-memory-2-"),
  );
  if (!firstAppCache || !firstCaches.includes("other-project-v1")) {
    throw new Error(`Unexpected first cache set: ${firstCaches.join(", ")}`);
  }

  await stopServer(server);
  server = undefined;
  buildTo(buildB, "e2e-cache-b");
  server = startServer(buildB);
  await waitForServer(baseURL);

  await page.reload();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
  await page.waitForTimeout(1_000);
  await page.reload();
  let secondCaches = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    secondCaches = await page.evaluate(() => caches.keys());
    if (
      secondCaches.some(
        (key) =>
          key.startsWith("phrase-memory-2-") &&
          key !== firstAppCache,
      ) &&
      !secondCaches.includes(firstAppCache)
    ) {
      break;
    }
    await page.waitForTimeout(250);
  }
  if (
    !secondCaches.some(
      (key) =>
        key.startsWith("phrase-memory-2-") &&
        key !== firstAppCache,
    ) ||
    secondCaches.includes(firstAppCache)
  ) {
    throw new Error(
      `Application cache did not upgrade: ${secondCaches.join(", ")}`,
    );
  }
  if (!secondCaches.includes("other-project-v1")) {
    throw new Error("Unrelated same-origin cache was removed");
  }
  console.log(
    JSON.stringify({
      firstAppCache,
      secondAppCaches: secondCaches.filter((key) =>
        key.startsWith("phrase-memory-2-"),
      ),
      unrelatedPreserved: secondCaches.includes("other-project-v1"),
    }),
  );
  await context.close();
} finally {
  await stopServer(server);
  await browser?.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
process.exit(0);
