// Static server for the fixture company sites, the way the grader serves theirs
// ("company sites may be served from a local address").
//   npm run fixtures            → http://localhost:8099/acme/, /quiet/, /inject/
// Tests import startFixtureServer(0) to get a random free port.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("./sites/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".txt": "text/plain", ".xml": "application/xml", ".json": "application/json" };

export function startFixtureServer(port = 8099) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://fixtures");
    const origin = `http://${req.headers.host}`;
    const filePath = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!filePath.startsWith(ROOT.replace(/[\\/]$/, "") + sep) && filePath + sep !== ROOT) {
      return send(res, 403, "text/plain", "forbidden");
    }
    try {
      let target = filePath;
      if ((await stat(target)).isDirectory()) {
        if (!url.pathname.endsWith("/")) {
          res.writeHead(301, { Location: `${url.pathname}/` });
          return res.end();
        }
        target = join(target, "index.html");
      }
      const body = (await readFile(target, "utf8")).replaceAll("{{ORIGIN}}", origin);
      return send(res, 200, TYPES[extname(target)] ?? "application/octet-stream", body);
    } catch {
      return send(res, 404, "text/html", "<!doctype html><title>Not found</title><p>Not found</p>");
    }
  });
  return new Promise((resolve) => {
    server.listen(port, () => resolve({ server, origin: `http://localhost:${server.address().port}` }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.FIXTURES_PORT) || 8099;
  const { origin } = await startFixtureServer(port);
  console.log(`fixture sites on ${origin}/acme/  ${origin}/quiet/  ${origin}/inject/  (404: ${origin}/missing/)`);
}

function send(res, status, type, body) {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}
