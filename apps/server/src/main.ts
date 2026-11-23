import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from './config';
import { getGameMode } from './game-modes/registry';
import { generateOperatorToken } from './operator/auth';
import { createLibraryConnectionFactory } from './providers/tiktok/connection';
import { createGameServer } from './realtime/socket-server';

const config = loadConfig();
const operatorToken = config.operatorToken ?? generateOperatorToken();

const webDir = config.webDir ? resolve(config.webDir) : undefined;
if (webDir && !existsSync(join(webDir, 'index.html'))) {
  console.error(`[server] WEB_DIR ${webDir} has no index.html. Build the web app first (pnpm build).`);
  process.exit(1);
}

const server = createGameServer({
  mode: getGameMode(config.game),
  modes: getGameMode,
  operatorToken,
  staticDir: webDir,
  tiktok: {
    enabled: config.tiktokEnabled,
    connect: createLibraryConnectionFactory({ signApiKey: config.signApiKey }),
    log: (line) => console.log(line),
  },
});

server.http.listen(config.port, config.host, () => {
  const origin = `http://${config.host}:${config.port}`;
  console.log(`[server] listening on ${origin}`);
  if (webDir) {
    console.log(`[server] serving the built web app from ${webDir}`);
    console.log(`[server] broadcast view: ${origin}/broadcast/`);
  }
  console.log(
    config.tiktokEnabled
      ? '[server] TikTok LIVE reading is ENABLED (read-only, unofficial access; the operator can stop it at any time)'
      : '[server] TikTok LIVE reading is off (start with TIKTOK_LIVE=on to allow it)',
  );
  if (!config.operatorToken) {
    console.log(`[server] operator token (this run only): ${operatorToken}`);
    // In development the pages come from Vite on 5173; in production the server serves them itself.
    const operatorOrigin = webDir ? origin : 'http://127.0.0.1:5173';
    console.log(`[server] operator page: ${operatorOrigin}/operator/#token=${operatorToken}`);
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
