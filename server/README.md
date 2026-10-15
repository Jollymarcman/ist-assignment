# Stick Fight WSS server

This is the first private multiplayer room-server scaffold. Render can deploy it in Singapore. It provides `/health` and a secure WebSocket endpoint at `/ws` (`wss://<service-host>/ws`).

## Render

The root-level `render.yaml` defines the service. In Render, create a new Blueprint and select this repository. Review the service settings (Node, Singapore, Free plan, root directory `server`) and apply it.

The free service can sleep after 15 minutes without inbound traffic, making the first connection after idle take about a minute. Room state is in memory and is lost on restart or redeploy. Keep one instance; this first version does not share state between instances.

## Protocol

Clients send JSON commands for `list`, `create`, `join`, and `leave`. The server assigns each connection a numeric peer ID and sends the room roster, host ID, and local peer ID to every room member. A `packet` JSON message carries a destination peer ID, channel, and base64 game packet. The server forwards the original packet in a binary frame prefixed by the sender peer ID and channel. A destination of `0` broadcasts to the other room members.

This is a relay, not an authoritative game server. The host browser continues to run Stick Fight's game rules and sends packets to the other clients through Render.

