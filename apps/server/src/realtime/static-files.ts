import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
};

function cacheControl(pathname: string, type: string): string {
  if (type.startsWith('text/html')) return 'no-cache'; // pages must always pick up a new build
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable'; // content-hashed filenames
  return 'public, max-age=3600';
}

function plain(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/**
 * Serves a directory of built files (the production web app) read-only. Anything that resolves outside the
 * directory, including through `..`, encoded separators, NUL bytes, or symlinks, is never served.
 * Returns true if it answered the request, false if the request is not for a file (so the caller can 404).
 */
export function createStaticHandler(rootDir: string) {
  const base = resolve(rootDir);

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      plain(res, 400, 'Bad request');
      return true;
    }
    if (pathname.includes('\0')) {
      plain(res, 400, 'Bad request');
      return true;
    }

    let target = resolve(base, `.${pathname}`);
    if (target !== base && !target.startsWith(base + sep)) {
      plain(res, 403, 'Forbidden');
      return true;
    }

    try {
      let info = await stat(target);
      if (info.isDirectory()) {
        if (!pathname.endsWith('/')) {
          res.writeHead(301, { location: `${pathname}/${url.search}` });
          res.end();
          return true;
        }
        target = join(target, 'index.html');
        info = await stat(target);
      }
      if (!info.isFile()) return false;

      // A symlink inside the directory must not lead outside it.
      const real = await realpath(target);
      if (!real.startsWith(`${await realpath(base)}${sep}`)) {
        plain(res, 403, 'Forbidden');
        return true;
      }

      const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'content-length': info.size, 'cache-control': cacheControl(pathname, type), 'x-content-type-options': 'nosniff' });
      if (req.method === 'HEAD') {
        res.end();
        return true;
      }
      createReadStream(real)
        .on('error', () => res.destroy())
        .pipe(res);
      return true;
    } catch {
      return false; // missing file: fall through to the caller's 404
    }
  };
}
