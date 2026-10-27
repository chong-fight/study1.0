import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../out");
const port = Number(process.env.PORT || 4175);
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

http
  .createServer((request, response) => {
    const pathname = decodeURIComponent((request.url || "/").split("?")[0]);
    if (basePath && !pathname.startsWith(`${basePath}/`) && pathname !== basePath) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    const withoutBase = basePath
      ? pathname.slice(basePath.length) || "/"
      : pathname;
    let relative = withoutBase.replace(/^\/+/, "");
    if (!relative || relative.endsWith("/")) {
      relative += "index.html";
    }
    let filePath = path.resolve(root, relative);
    if (!filePath.startsWith(root + path.sep)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    } else if (!fs.existsSync(filePath) && !path.extname(filePath)) {
      filePath += ".html";
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type":
        types[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(response);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Static preview: http://127.0.0.1:${port}/`);
  });
