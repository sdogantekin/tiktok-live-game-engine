import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMahalleHalayiMode } from '../src/game-modes/mahalle-halayi/rules';
import { createGameServer, type GameServer } from '../src/realtime/socket-server';
import { parseRange } from '../src/realtime/static-files';

/** Sends a request with the path exactly as given (fetch would normalize `..` away). */
function raw(port: number, path: string, method = 'GET', headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('serving the built web app', () => {
  let server: GameServer;
  let port: number;
  let secret: string;

  beforeEach(async () => {
    const root = mkdtempSync(join(tmpdir(), 'static-test-'));
    const web = join(root, 'web');
    mkdirSync(join(web, 'broadcast'), { recursive: true });
    mkdirSync(join(web, 'assets'));
    mkdirSync(join(web, 'game-modes', 'x', 'models'), { recursive: true });
    writeFileSync(join(web, 'index.html'), '<h1>home</h1>');
    writeFileSync(join(web, 'broadcast', 'index.html'), '<h1>broadcast</h1>');
    writeFileSync(join(web, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(web, 'game-modes', 'x', 'models', 'a.glb'), 'glTF');
    mkdirSync(join(web, 'game-modes', 'x', 'audio'), { recursive: true });
    writeFileSync(join(web, 'game-modes', 'x', 'audio', 'song.mp3'), '0123456789');
    secret = join(root, 'secret.txt');
    writeFileSync(secret, 'TOP SECRET');
    symlinkSync(secret, join(web, 'link.txt'));

    server = createGameServer({ mode: createMahalleHalayiMode(), operatorToken: 'test-token-123', staticDir: web });
    await new Promise<void>((resolve) => server.http.listen(0, '127.0.0.1', resolve));
    port = (server.http.address() as AddressInfo).port;
  });
  afterEach(() => server.close());

  it('serves pages, scripts and models with the right types and caching', async () => {
    const page = await raw(port, '/broadcast/');
    expect(page).toMatchObject({ status: 200, body: '<h1>broadcast</h1>' });
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.headers['cache-control']).toBe('no-cache');

    const home = await raw(port, '/');
    expect(home.body).toBe('<h1>home</h1>');

    const script = await raw(port, '/assets/app-abc123.js');
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(script.headers['x-content-type-options']).toBe('nosniff');

    expect((await raw(port, '/game-modes/x/models/a.glb')).headers['content-type']).toBe('model/gltf-binary');
  });

  it('serves audio with the right type and supports byte ranges, so the browser can loop and seek', async () => {
    const whole = await raw(port, '/game-modes/x/audio/song.mp3');
    expect(whole).toMatchObject({ status: 200, body: '0123456789' });
    expect(whole.headers['content-type']).toBe('audio/mpeg');
    expect(whole.headers['accept-ranges']).toBe('bytes');

    const part = await raw(port, '/game-modes/x/audio/song.mp3', 'GET', { range: 'bytes=2-5' });
    expect(part).toMatchObject({ status: 206, body: '2345' });
    expect(part.headers['content-range']).toBe('bytes 2-5/10');
    expect(part.headers['content-length']).toBe('4');

    expect((await raw(port, '/game-modes/x/audio/song.mp3', 'GET', { range: 'bytes=7-' })).body).toBe('789');
    expect((await raw(port, '/game-modes/x/audio/song.mp3', 'GET', { range: 'bytes=-3' })).body).toBe('789');

    const unsatisfiable = await raw(port, '/game-modes/x/audio/song.mp3', 'GET', { range: 'bytes=50-60' });
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers['content-range']).toBe('bytes */10');
  });

  it('redirects a directory without a trailing slash, keeping the query string', async () => {
    const response = await raw(port, '/broadcast?perf=1');
    expect(response.status).toBe(301);
    expect(response.headers.location).toBe('/broadcast/?perf=1');
  });

  it('answers HEAD without a body and 404s on missing files and other methods', async () => {
    const head = await raw(port, '/broadcast/', 'HEAD');
    expect(head).toMatchObject({ status: 200, body: '' });
    expect(head.headers['content-length']).toBe(String('<h1>broadcast</h1>'.length));

    expect((await raw(port, '/nope.js')).status).toBe(404);
    expect((await raw(port, '/broadcast/', 'POST')).status).toBe(404);
  });

  it('never serves anything outside the directory', async () => {
    const attempts = [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/..%2fsecret.txt',
      '/assets/../../secret.txt',
      '/%2e%2e%2f%2e%2e%2fetc/passwd',
      '/broadcast/%00.html',
      '/link.txt', // a symlink that points outside
    ];
    for (const path of attempts) {
      const response = await raw(port, path);
      expect(response.body, path).not.toContain('TOP SECRET');
      expect([400, 403, 404], path).toContain(response.status);
    }
    expect((await raw(port, '/%')).status).toBe(400); // malformed escape
  });

  it('keeps /health and Socket.IO working alongside the files', async () => {
    expect(JSON.parse((await raw(port, '/health')).body)).toEqual({ status: 'ok' });
    expect((await raw(port, '/socket.io/?EIO=4&transport=polling')).status).toBe(200);
  });
});

describe('parseRange', () => {
  it('reads a single byte range and rejects anything it cannot satisfy', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 }); // a suffix longer than the file: all of it
    expect(parseRange('bytes=95-500', 100)).toEqual({ start: 95, end: 99 }); // an end past the file is clipped
    for (const bad of ['bytes=100-', 'bytes=50-10', 'bytes=-', 'bytes=-0', 'bytes=a-b', 'items=0-5', 'bytes=0-5,10-15', '']) {
      expect(parseRange(bad, 100), bad).toBe('invalid');
    }
  });
});
