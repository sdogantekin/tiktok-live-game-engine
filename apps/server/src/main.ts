import { loadConfig } from './config';
import { createGameServer } from './server';

const config = loadConfig();
const server = createGameServer();

server.http.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
