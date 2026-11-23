import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { createMahalleHalayiMode } from '../src/game-modes/mahalle-halayi/rules';
import { createGameServer, type GameServer } from '../src/realtime/socket-server';

describe('config', () => {
  it('defaults to loopback:3001 with no preset operator token, and with TikTok reading off', () => {
    expect(loadConfig({})).toMatchObject({ host: '127.0.0.1', port: 3001, tiktokEnabled: false });
    expect(loadConfig({}).signApiKey).toBeUndefined();
  });

  it('turns TikTok reading on only when asked, and reads the optional signing-service key', () => {
    expect(loadConfig({ TIKTOK_LIVE: 'on' }).tiktokEnabled).toBe(true);
    expect(loadConfig({ TIKTOK_LIVE: 'off' }).tiktokEnabled).toBe(false);
    expect(() => loadConfig({ TIKTOK_LIVE: 'yes' })).toThrow(); // anything but on/off is a mistake, not "on"
    expect(loadConfig({ EULER_API_KEY: 'a-long-enough-key' }).signApiKey).toBe('a-long-enough-key');
    expect(loadConfig({ EULER_API_KEY: '' }).signApiKey).toBeUndefined();
  });

  it('reads and validates the operator token and port', () => {
    expect(loadConfig({ OPERATOR_TOKEN: 'long-enough-token' }).operatorToken).toBe('long-enough-token');
    expect(loadConfig({ OPERATOR_TOKEN: '' }).operatorToken).toBeUndefined(); // empty means "generate one"
    expect(() => loadConfig({ OPERATOR_TOKEN: 'short' })).toThrow();
    expect(() => loadConfig({ PORT: 'abc' })).toThrow();
    expect(() => loadConfig({ PORT: '70000' })).toThrow();
  });
});

describe('http server', () => {
  let server: GameServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('serves /health and 404s everything else', async () => {
    server = createGameServer({ mode: createMahalleHalayiMode(), operatorToken: 'test-token-123' });
    await new Promise<void>((resolve) => server!.http.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;

    expect(await (await fetch(`${base}/health`)).json()).toEqual({ status: 'ok' });
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
