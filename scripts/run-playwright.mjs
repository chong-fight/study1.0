import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const pagesMode = process.argv.includes("--pages");
const port = pagesMode ? "4178" : "4177";
const basePath = pagesMode ? "/phrase-memory-2" : "";
const config = pagesMode
  ? "playwright.pages.config.ts"
  : "playwright.config.ts";
const baseURL = `http://127.0.0.1:${port}${basePath}/`;
const marker = path.join(
  os.tmpdir(),
  `phrase-memory-e2e-${process.pid}.done`,
);

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // Retry while the static server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Static server did not start: ${baseURL}`);
}

function stopServer(server) {
  if (!server || server.killed) return;
  server.kill();
}

const server = spawn(process.execPath, ["scripts/serve-static.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: port,
    NEXT_PUBLIC_BASE_PATH: basePath,
    E2E_DONE_FILE: marker,
  },
  stdio: "ignore",
});

try {
  await waitForServer();
  const exitCode = await runPlaywright(config, marker);
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  stopServer(server);
}

function runPlaywright(configFile, markerFile) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        path.join(process.cwd(), "node_modules", "@playwright", "test", "cli.js"),
        "test",
        "--config",
        configFile,
        ...process.argv.slice(2).filter((item) => item !== "--pages"),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          NO_COLOR: "1",
        },
        stdio: ["inherit", "pipe", "pipe"],
      },
    );
    let output = "";
    let settled = false;
    let markerTimer;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearInterval(markerTimer);
      child.kill();
      resolve(code);
    };
    const inspect = (chunk, stream) => {
      stream.write(chunk);
      output = `${output}${chunk.toString()}`.slice(-16_000);
      const plain = output
        .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
        .replace(/\r/g, "");
      if (plain.includes(" passed") || plain.includes(" failed")) {
        finish(plain.includes(" failed") ? 1 : 0);
      }
    };
    child.stdout.on("data", (chunk) => inspect(chunk, process.stdout));
    child.stderr.on("data", (chunk) => inspect(chunk, process.stderr));
    child.on("exit", (code) => finish(code ?? 1));
    markerTimer = setInterval(() => {
      if (!fs.existsSync(markerFile)) return;
      clearInterval(markerTimer);
      finish(output.includes(" failed") ? 1 : 0);
    }, 250);
    setTimeout(() => finish(1), 120_000).unref();
  });
}
