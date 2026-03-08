# Firefighter HUD Frontend

This Next.js app powers two views for the HackCanada firefighter XR demo:

- `/firefighter` — chest-phone / XR guidance view with live device camera preview and compass-style movement cue.
- `/commander` — mirrored observer HUD with object highlighting, biometrics, and a `three.js` return-path scene.

## MVP Features

- firefighter-facing compass guidance that points toward the safest forward direction
- commander-facing HUD with highlighted objects and route-back arrows
- simulated Samsung watch biometrics and room detections
- backend polling against the FastAPI control plane
- `three.js` visualization for the return path

## Local Setup

Install dependencies:

```bash
npm install
```

Optionally set a backend URL for the Next.js server if it differs from the
default `http://127.0.0.1:8000`:

```bash
BACKEND_URL=http://127.0.0.1:8000
```

The browser now calls the backend through the Next.js `/api/backend/*` proxy,
so mobile clients on Tailscale only need to reach the Next app origin. They do
not need direct access to the Python backend host.

Run the frontend:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Backend Dependency

This app expects the FastAPI backend in `../backend` to be running. The main session endpoint used by the UI is:

- `GET /api/sessions/demo-session`

The UI can also advance the mock scenario by calling:

- `POST /api/sessions/demo-session/simulate`

## Demo Flow

1. Open `/firefighter` on the chest-mounted phone.
2. Tap `Start camera` to preview the live phone feed.
3. Open `/commander` on the monitor or judge-facing screen.
4. Use `Advance live state` or `Simulate next step` to cycle guidance, biometrics, and object detections.
5. Show the commander how the mirrored HUD tracks critical objects and renders the return path.

## Next Up

- replace polling with actual WebRTC video sharing
- ingest Samsung watch biometrics for real
- add Auth0-protected commander access
- connect detections to a real object-recognition pipeline
