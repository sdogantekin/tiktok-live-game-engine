import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from './config';
import { getGameMode } from './game-modes/registry';
import { generateOperatorToken } from './operator/auth';
import { createGameServer } from './realtime/socket-server';

const config = loadConfig();
const operatorToken = config.operatorToken ?? generateOperatorToken();

const webDir = config.webDir ? resolve(config.webDir) : undefined;
if (webDir && !existsSync(join(webDir, 'index.html'))) {
  console.error(`[server] WEB_DIR ${webDir} has no index.html. Build the web app first (pnpm build).`);
  process.exit(1);
}

const server = createGameServer({ mode: getGameMode('mahalle-halayi'), operatorToken, staticDir: webDir });

server.http.listen(config.port, config.host, () => {
  const origin = `http://${config.host}:${config.port}`;
  console.log(`[server] listening on ${origin}`);
  if (webDir) {
    console.log(`[server] serving the built web app from ${webDir}`);
    console.log(`[server] broadcast view: ${origin}/broadcast/`);
  }
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
