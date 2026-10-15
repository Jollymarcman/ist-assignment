# Webports Arcade

A GitHub Pages hub for browser game ports, with a separate Render-hosted WebSocket server for the Stick Fight multiplayer prototype.

## GitHub Pages

The Pages workflow publishes only the `site/` folder, keeping the server source out of the public website artifact. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** if it is not already selected.

## Stick Fight server

The root `render.yaml` is a Render Blueprint for the Node room server in `server/`. Create a Blueprint in Render and select this repository. It is configured for the free Singapore region. The room protocol is documented in `server/README.md`.

The server scaffold is not connected to the Unity WebGL client yet. The game's WebSocket bridge, packet adapter, and in-game lobby flow remain to be implemented before multiplayer can work.

## Game links

- Among Us opens the existing browser port at [jollymarcman.github.io/math-assessment](https://jollymarcman.github.io/math-assessment/play.html).
- Stick Fight is listed as in progress until its browser client is connected.