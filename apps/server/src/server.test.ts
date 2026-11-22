import type { AddressInfo } from 'node:net';
import { io as connect } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { HelloSchema, SOCKET_NAMESPACES } from '@live-game/contracts';
import { loadConfig } from './config';
import { createGameServer } from './server';

describe('config', () => {
  it('defaults to loopback:3001 and rejects invalid ports', () => {
    expect(loadConfig({})).toEqual({ host: '127.0.0.1', port: 3001 });
    expect(() => loadConfig({ PORT: 'abc' })).toThrow();
    expect(() => loadConfig({ PORT: '70000' })).toThrow();
  });
});

describe('game server', () => {
  let server: ReturnType<typeof createGameServer> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  async function start() {
    server = createGameServer();
    await new Promise<void>((resolve) => server!.http.listen(0, '127.0.0.1', resolve));
    return (server.http.address() as AddressInfo).port;
  }

  it('serves /health', async () => {
    const port = await start();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it.each(Object.values(SOCKET_NAMESPACES))('sends hello on namespace %s', async (namespace) => {
    const port = await start();
    const client = connect(`http://127.0.0.1:${port}${namespace}`, { transports: ['websocket'] });
    const payload = await new Promise((resolve, reject) => {
      client.on('hello', resolve);
      client.on('connect_error', reject);
    });
    client.close();
    expect(HelloSchema.parse(payload).namespace).toBe(namespace);
  });
});
