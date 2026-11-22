import { loadConfig } from './config';
import { getGameMode } from './game-modes/registry';
import { generateOperatorToken } from './operator/auth';
import { createGameServer } from './realtime/socket-server';

const config = loadConfig();
const operatorToken = config.operatorToken ?? generateOperatorToken();

const server = createGameServer({ mode: getGameMode('mahalle-halayi'), operatorToken });

server.http.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
  if (!config.operatorToken) {
    console.log(`[server] operator token (this run only): ${operatorToken}`);
    console.log(`[server] operator page (dev): http://127.0.0.1:5173/operator/#token=${operatorToken}`);
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
