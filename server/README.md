# Stick Fight WSS server

This is the first private multiplayer room-server scaffold. Render can deploy it in Singapore. It provides `/health` and a secure WebSocket endpoint at `/ws` (`wss://<service-host>/ws`).

## Render

The root-level `render.yaml` defines the service. In Render, create a new Blueprint and select this repository. Review the service settings (Node, Singapore, Free plan, root directory `server`) and apply it.

The free service can sleep after 15 minutes without inbound traffic, making the first connection after idle take about a minute. Room state is in memory and is lost on restart or redeploy. Keep one instance; this first version does not share state between instances.

## Initial protocol

Clients can send JSON commands: `list`, `create` with a player `name`, `join` with a room `code` and `name`, `leave`, and `start` (host only, at least two players). After joining, binary WebSocket messages are relayed unchanged to the other players in that room.

The Unity WebGL game client still needs its browser WebSocket bridge and an adapter for Stick Fight's packet handlers. This server by itself does not make matches playable yet.