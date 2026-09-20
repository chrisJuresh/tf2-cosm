/**
 * The static server the end-to-end suite points a browser at.
 *
 * A static export is a folder of files, and serving one takes fifty lines, so
 * it takes fifty lines here rather than a dependency. Two folders are mounted:
 * the built site, and the placeholder Worn Renders at `/renders`, which is the
 * image base the site falls back to when `NEXT_PUBLIC_RENDER_BASE_URL` says
 * nothing. Mounting rather than copying keeps the built site exactly as
 * `next build` wrote it.
 *
 * A request for something neither folder has is a 404, and the suite treats any
 * 404 as a failure — which is the whole point of serving the export ourselves
 * rather than trusting a dev server to invent a route.
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

import { BASE_URL, PORT, RENDERS_DIR, SITE_DIR } from "./fixture-site.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** Where on disk a request path lives, or null if it escapes its folder. */
function fileFor(urlPath) {
  const [mount, root] = urlPath.startsWith("/renders/") ? ["/renders/", RENDERS_DIR] : ["/", SITE_DIR];
  const relative = normalize(decodeURIComponent(urlPath.slice(mount.length))).replace(/^(\.\.[/\\])+/, "");
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

/** A folder means its index, and an extensionless path means the `.html` Next exported. */
function resolveFile(file) {
  for (const candidate of [file, join(file, "index.html"), `${file}.html`]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this one; try the next.
    }
  }
  return null;
}

export const server = createServer((request, response) => {
  const urlPath = new URL(request.url ?? "/", BASE_URL).pathname;
  const asked = fileFor(urlPath);
  const file = asked === null ? null : resolveFile(asked);
  if (file === null) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(`no such file: ${urlPath}\n`);
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`serving ${SITE_DIR} at ${BASE_URL}\n`);
});
