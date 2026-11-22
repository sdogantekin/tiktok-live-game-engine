import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { HelloSchema, SOCKET_NAMESPACES } from '@live-game/contracts';

export function createGameServer() {
  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404).end();
  });

  const io = new Server(http);

  for (const namespace of Object.values(SOCKET_NAMESPACES)) {
    io.of(namespace).on('connection', (socket) => {
      socket.emit('hello', HelloSchema.parse({ status: 'ok', namespace, serverTime: Date.now() }));
    });
  }

  return {
    http,
    io,
    close: () => io.close(),
  };
}
