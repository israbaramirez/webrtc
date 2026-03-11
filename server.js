const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  return rooms.get(roomId);
}

function broadcastToRoom(roomId, data, exceptSocket = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const client of room) {
    if (client.readyState === WebSocket.OPEN && client !== exceptSocket) {
      client.send(JSON.stringify(data));
    }
  }
}

function cleanupSocket(socket) {
  const { roomId } = socket;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.delete(socket);
  if (room.size === 0) {
    rooms.delete(roomId);
  } else {
    broadcastToRoom(roomId, { type: 'peer-left' }, socket);
  }
}

wss.on('connection', (socket) => {
  socket.on('message', (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch (error) {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Mensaje inválido. Debe ser JSON válido.'
      }));
      return;
    }

    const { type, roomId, payload } = message;

    switch (type) {
      case 'join': {
        if (!roomId || typeof roomId !== 'string') {
          socket.send(JSON.stringify({ type: 'error', message: 'roomId requerido.' }));
          return;
        }

        socket.roomId = roomId;
        const room = getRoom(roomId);

        if (room.size >= 2) {
          socket.send(JSON.stringify({ type: 'room-full' }));
          return;
        }

        room.add(socket);

        const userCount = room.size;
        socket.send(JSON.stringify({ type: 'joined', payload: { roomId, userCount } }));

        if (userCount === 2) {
          broadcastToRoom(roomId, { type: 'ready' });
        }
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        if (!socket.roomId) {
          socket.send(JSON.stringify({ type: 'error', message: 'Primero debes unirte a una sala.' }));
          return;
        }

        broadcastToRoom(socket.roomId, {
          type,
          payload
        }, socket);
        break;
      }

      case 'leave': {
        cleanupSocket(socket);
        socket.roomId = null;
        break;
      }

      default:
        socket.send(JSON.stringify({ type: 'error', message: `Tipo no soportado: ${type}` }));
    }
  });

  socket.on('close', () => cleanupSocket(socket));
  socket.on('error', () => cleanupSocket(socket));
});

server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
