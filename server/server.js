import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.PORT || 10000);
const maxRooms = Number(process.env.MAX_ROOMS || 100);
const roomCapacity = 4;
const roomCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rooms = new Map();
const clients = new Map();

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size, clients: clients.size }));
    return;
  }
  response.writeHead(404);
  response.end("Not found");
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws", maxPayload: 384 * 1024 });

function sendJson(socket, value) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function newCode() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = "";
    for (let i = 0; i < 6; i += 1) code += roomCodeChars[randomInt(roomCodeChars.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error("Unable to allocate a room code");
}

function roomSummary(room) {
  return { code: room.code, players: room.players.size, capacity: roomCapacity };
}

function sendLobbyState(room) {
  const players = [...room.players.values()].map((player) => ({ id: String(player.peerId), name: player.name }));
  for (const [id, player] of room.players) {
    sendJson(player.socket, { type: "lobby", code: room.code, room: roomSummary(room), hostId: String(room.players.get(room.hostId).peerId), players, selfId: String(player.peerId) });
  }
}

function newPeerId() {
  const inUse = new Set([...clients.values()].map((client) => client.peerId));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = randomInt(1, 0x7fffffff);
    if (!inUse.has(id)) return id;
  }
  throw new Error("Unable to allocate a player id");
}

function leaveRoom(client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  if (!room) return;
  room.players.delete(client.id);
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === client.id) room.hostId = room.players.keys().next().value;
  sendLobbyState(room);
}

function fail(socket, code, message) {
  sendJson(socket, { type: "error", code, message });
}

function enterRoom(client, room, name) {
  if (client.roomCode) leaveRoom(client);
  if (room.players.size >= roomCapacity) return fail(client.socket, "ROOM_FULL", "That room is full.");
  room.players.set(client.id, { socket: client.socket, name, peerId: client.peerId });
  client.roomCode = room.code;
  sendLobbyState(room);
}

function handleCommand(client, value) {
  if (!value || typeof value !== "object" || typeof value.type !== "string") {
    fail(client.socket, "BAD_MESSAGE", "Expected a JSON command.");
    return;
  }
  if (value.type === "list") {
    sendJson(client.socket, { type: "rooms", rooms: [...rooms.values()].map(roomSummary) });
    return;
  }
  if (value.type === "create") {
    if (rooms.size >= maxRooms) return fail(client.socket, "SERVER_FULL", "The server is at its room limit.");
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 20) : "";
    if (!name) return fail(client.socket, "BAD_NAME", "Choose a player name first.");
    const room = { code: newCode(), hostId: client.id, players: new Map() };
    rooms.set(room.code, room);
    enterRoom(client, room, name);
    return;
  }
  if (value.type === "join") {
    const code = typeof value.code === "string" ? value.code.trim().toUpperCase() : "";
    const name = typeof value.name === "string" ? value.name.trim().slice(0, 20) : "";
    const room = rooms.get(code);
    if (!name) return fail(client.socket, "BAD_NAME", "Choose a player name first.");
    if (!room) return fail(client.socket, "ROOM_NOT_FOUND", "That room no longer exists.");
    enterRoom(client, room, name);
    return;
  }
  if (value.type === "leave") {
    leaveRoom(client);
    sendJson(client.socket, { type: "left" });
    return;
  }
  if (value.type === "start") {
    const room = rooms.get(client.roomCode);
    if (!room || room.hostId !== client.id) return fail(client.socket, "NOT_HOST", "Only the room host can start.");
    if (room.players.size < 2) return fail(client.socket, "NEED_PLAYERS", "At least two players are needed.");
    for (const player of room.players.values()) sendJson(player.socket, { type: "start" });
    return;
  }
  if (value.type === "packet") {
    const room = rooms.get(client.roomCode);
    if (!room) return fail(client.socket, "NOT_IN_ROOM", "Join a room before sending game data.");
    const targetId = Number(value.to) >>> 0;
    const channel = Number(value.channel) & 0xff;
    if (typeof value.data !== "string" || value.data.length > 350000)
      return fail(client.socket, "BAD_PACKET", "The game packet is missing or too large.");
    let payload;
    try { payload = Buffer.from(value.data, "base64"); }
    catch { return fail(client.socket, "BAD_PACKET", "The game packet is not valid base64."); }
    if (payload.length === 0 || payload.length > 256 * 1024)
      return fail(client.socket, "BAD_PACKET", "The game packet is empty or too large.");
    const frame = Buffer.allocUnsafe(5 + payload.length);
    frame.writeUInt32LE(client.peerId, 0);
    frame.writeUInt8(channel, 4);
    payload.copy(frame, 5);
    const targets = targetId === 0
      ? [...room.players.values()].filter((player) => player.socket !== client.socket)
      : [...room.players.values()].filter((player) => player.peerId === targetId);
    if (targetId !== 0 && targets.length === 0)
      return fail(client.socket, "PLAYER_NOT_FOUND", "That player is no longer in the room.");
    for (const player of targets)
      if (player.socket.readyState === WebSocket.OPEN) player.socket.send(frame, { binary: true });
    return;
  }
  fail(client.socket, "UNKNOWN_COMMAND", "That command is not supported.");
}

wss.on("connection", (socket) => {
  const client = { id: randomUUID(), peerId: newPeerId(), socket, roomCode: null, alive: true };
  clients.set(client.id, client);
  socket.on("pong", () => { client.alive = true; });
  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      const room = rooms.get(client.roomCode);
      if (!room) return fail(socket, "NOT_IN_ROOM", "Join a room before sending game data.");
      const frame = Buffer.allocUnsafe(5 + data.length);
      frame.writeUInt32LE(client.peerId, 0);
      frame.writeUInt8(0, 4);
      data.copy(frame, 5);
      for (const [id, player] of room.players) {
        if (id !== client.id && player.socket.readyState === WebSocket.OPEN) player.socket.send(frame, { binary: true });
      }
      return;
    }
    try {
      handleCommand(client, JSON.parse(data.toString()));
    } catch {
      fail(socket, "BAD_JSON", "Could not read that command.");
    }
  });
  socket.on("close", () => {
    leaveRoom(client);
    clients.delete(client.id);
  });
  socket.on("error", () => socket.terminate());
  sendJson(socket, { type: "connected", clientId: client.id, peerId: client.peerId, protocol: 2 });
});

const heartbeat = setInterval(() => {
  for (const client of clients.values()) {
    if (!client.alive) {
      client.socket.terminate();
      continue;
    }
    client.alive = false;
    client.socket.ping();
  }
}, 25_000);

httpServer.listen(port, "0.0.0.0", () => console.log(`Stick Fight WSS server listening on ${port}`));
httpServer.on("close", () => clearInterval(heartbeat));

