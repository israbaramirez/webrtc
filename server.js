const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const rooms = new Map(); // roomName -> Map(peerId, ws)

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(roomName, payload, exceptPeerId = null) {
  const room = rooms.get(roomName);
  if (!room) return;
  for (const [peerId, ws] of room.entries()) {
    if (peerId !== exceptPeerId) send(ws, payload);
  }
}

function removeFromRoom(ws) {
  if (!ws.roomName || !ws.peerId) return;
  const room = rooms.get(ws.roomName);
  if (!room) return;

  room.delete(ws.peerId);

  broadcastRoom(ws.roomName, {
    type: "peer-left",
    peerId: ws.peerId
  });

  if (room.size === 0) {
    rooms.delete(ws.roomName);
  }
}

wss.on("connection", (ws) => {
  ws.peerId = crypto.randomUUID();
  ws.roomName = null;

  send(ws, { type: "welcome", peerId: ws.peerId });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "join-room") {
      const roomName = String(msg.room || "").trim();
      if (!roomName) {
        return send(ws, { type: "error", message: "Room is required." });
      }

      removeFromRoom(ws);
      ws.roomName = roomName;

      if (!rooms.has(roomName)) rooms.set(roomName, new Map());
      const room = rooms.get(roomName);

      if (room.size >= 2) {
        ws.roomName = null;
        return send(ws, {
          type: "room-full",
          message: "This demo supports only 2 peers per room."
        });
      }

      const existingPeerIds = [...room.keys()];
      room.set(ws.peerId, ws);

      send(ws, {
        type: "joined-room",
        room: roomName,
        peerId: ws.peerId,
        peers: existingPeerIds
      });

      for (const existingPeerId of existingPeerIds) {
        const existingWs = room.get(existingPeerId);
        send(existingWs, {
          type: "peer-joined",
          peerId: ws.peerId
        });
      }

      // when room has 2 peers, let the newer joiner initiate
      if (room.size === 2 && existingPeerIds.length === 1) {
        send(ws, {
          type: "ready",
          target: existingPeerIds[0],
          initiator: true
        });
        const firstPeerWs = room.get(existingPeerIds[0]);
        send(firstPeerWs, {
          type: "ready",
          target: ws.peerId,
          initiator: false
        });
      }

      return;
    }

    if (!ws.roomName) {
      return send(ws, { type: "error", message: "Join a room first." });
    }

    const room = rooms.get(ws.roomName);
    if (!room) return;

    // relay only to explicit target peer
    if (msg.target) {
      const targetWs = room.get(msg.target);
      if (!targetWs) return;

      send(targetWs, {
        ...msg,
        from: ws.peerId
      });
      return;
    }
  });

  ws.on("close", () => {
    removeFromRoom(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
