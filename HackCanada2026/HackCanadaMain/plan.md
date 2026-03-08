## Detailed Plan: Firefighter Commander HUD

The product is a commander-facing augmented reality HUD that lets a captain or judge wearing AR glasses see what a firefighter sees in the field, along with key status overlays like pulse, stream health, and alert state. The core idea is to treat the glasses as a lightweight display device, not as the place where the heavy data collection happens. The firefighter wears a phone on the body or helmet to act as the camera source. That phone captures live video, sends it through a low-latency stream, and the AR HUD renders the feed plus operational overlays. Tailscale secures connectivity between devices, Auth0 controls captain access, and the pulse detector service (`persage`, pending exact confirmation) contributes telemetry into the HUD.

In the more advanced version of the experience, the commander can also place directional arrows on the floor to help retrace the firefighter’s movement through a room or hallway, and the system can scan the visible scene to identify high-priority objects such as large obstacles, exits, furniture, people-sized shapes, or potentially valuable/important assets that may need attention or rescue. That introduces a second technical track beyond live video: spatial computing and scene understanding.

## Product Roles and Devices

### 1. Firefighter Device
This is the phone physically attached to the firefighter. Its responsibilities are:
- capture video from the rear camera,
- optionally capture microphone audio,
- read or relay device metadata like battery/network condition,
- connect securely to the backend/signaling service,
- publish a live video stream to a commander session.

For the hackathon version, the phone should be treated as the sensor pack. It is the easiest hardware to mount, it already has a high-quality camera, and browsers on phones can access the camera with `getUserMedia`. A dedicated mobile app could come later, but the fastest demo path is a mobile web sender page or a minimal PWA.

### 2. Commander / Judge Viewer Device
This is the AR glasses device or whatever browser-backed display the judges will wear. The glasses should not be responsible for capturing video; instead they should open the secure HUD page and render:
- the live video feed,
- pulse and firefighter vitals,
- commander-placed spatial arrows or breadcrumbs,
- object highlights and risk markers,
- stream status and latency indicators,
- emergency alerts and connection warnings,
- optional mission data like firefighter name, zone, timer, or team status.

In practice, many AR glasses either mirror a phone/browser or run a lightweight browser themselves. That means the HUD should be implemented as a responsive web UI with a high-contrast, minimal visual layer. The interface must work even if the AR glasses are effectively just displaying a web page from a paired device.

### 3. Backend Coordination Service
The backend in `backend/main.py` should not try to act as a raw video relay unless absolutely necessary. Instead, it should handle:
- stream session creation,
- signaling for the video connection,
- telemetry ingestion,
- pulse data normalization,
- presence/health checks,
- authorization checks for access to the stream.

This keeps the backend simpler and more reliable. Video is best handled peer-to-peer or through a media-capable service, while the backend manages control-plane responsibilities.

## High-Level Architecture

The cleanest implementation for the demo is:

1. Firefighter phone opens a sender page.
2. Captain or judge opens the HUD page on the AR display.
3. Both devices authenticate or join a shared incident session.
4. The backend creates a session record and provides signaling endpoints.
5. The phone captures camera video with WebRTC.
6. The HUD receives the live stream with WebRTC.
7. Pulse data enters through `persage` integration or a mocked telemetry endpoint.
8. The HUD overlays the pulse and connection state on top of the video.
9. Tailscale secures how the devices reach each other and/or the backend.

This division matters because Tailscale is not the video protocol. Tailscale gives secure network reachability. WebRTC is what gives the low-latency live feed. Auth0 gives captain identity and protected access. The HUD is then just the presentation layer on top of those systems.

## Why WebRTC is the Right Video Approach

For this use case, WebRTC is the best fit because it is built for low-latency real-time media in browsers. If the firefighter phone captures video and the AR viewer receives it, WebRTC avoids the delay that would come from uploading chunks of video over ordinary HTTP. It also supports adaptive streaming, better interactive latency, and direct device-to-device media paths where possible.

Without WebRTC, the fallback options would be things like:
- repeated image upload snapshots,
- HLS or similar video streaming,
- custom WebSocket binary video transport.

All of those are worse for a tactical live-feed demo because they are either laggier, harder to stabilize, or harder to implement correctly in the available time.

## How the AR Glasses Fit In

The AR glasses are conceptually the display surface for the commander HUD. The implementation should assume one of two realities:

### Option A: The glasses can open a web page directly
In this case, the judges load the Next.js HUD URL directly in the browser provided by the glasses. The UI should be:
- full screen,
- minimal chrome,
- large text,
- high contrast,
- compatible with touch or simple pointer controls.

### Option B: The glasses mirror a paired phone or companion device
In this case, the actual browser session runs on a companion phone, and the glasses display it. The implementation is still basically the same from a web app perspective. The only difference is that the person wearing the glasses may be interacting through a phone or external controller rather than directly through the glasses.

For the hackathon, the safest engineering assumption is to build a browser-based HUD that works on any modern Chromium/Safari-style device. That gives the highest chance the AR hardware can display it, even if the glasses are not fully open as a computing platform.

If the glasses support proper spatial tracking or WebXR, we can render 3D arrows and object markers in world space. If they do not, we should degrade gracefully to a 2D overlay mode where arrows and highlighted regions are drawn on top of the video feed instead of being anchored in the real world. This fallback is extremely important because browser-based AR support varies a lot across devices.

## Detailed Implementation by Layer

### Layer 1: Frontend HUD in Next.js

The frontend in `my-app/` should become two main experiences:

#### A. Captain HUD Page
This is the AR-display view. It should contain:
- a large central live video panel,
- a top bar for connection, incident ID, and firefighter identity,
- a vitals panel with pulse and alert levels,
- a spatial guidance layer for arrows, breadcrumbs, or path markers,
- an object-priority layer for highlighted assets and obstacles,
- an incident status panel for “live”, “reconnecting”, or “sensor lost”,
- simple action buttons like mute, fullscreen, reconnect, or acknowledge alert.

The layout should be optimized for glanceability. Since the judges are wearing glasses, the UI should avoid dense dashboards. Think more like a tactical visor overlay than a desktop admin console.

#### B. Spatial Overlay System with `three.js`
This is where `three.js` comes in. The HUD should include a 3D rendering layer that can draw:
- floor arrows,
- directional breadcrumbs,
- room labels,
- object outlines or bounding markers,
- danger markers around obstacles or blocked paths.

The key point is that `three.js` is not the scanner by itself. It is the visualization engine. It renders arrows and markers based on spatial data coming from the phone camera, AR tracking, or a scene-analysis service.

There are two implementation modes:

##### Mode 1: True 3D Anchored AR
If the AR hardware and browser stack support spatial tracking, the system can place arrows and highlights at specific coordinates in the room. That means the commander can drop a marker and the user sees it aligned with the floor or object position.

To make this work, the system needs:
- a world coordinate system,
- camera pose updates,
- floor plane or surface detection,
- a way to convert taps/clicks into 3D world coordinates,
- stable anchors for arrows and highlights.

In this mode, `three.js` renders the geometry and a tracking layer provides the coordinates.

##### Mode 2: 2D Perspective Overlay Fallback
If true AR anchoring is not available, `three.js` or a simpler canvas layer can still render perspective arrows and object boxes over the live video feed. In this version, arrows are visually helpful but not perfectly fixed to the room. This is much easier to demo and still sells the idea.

For the hackathon, the recommended approach is to implement Mode 2 first, then upgrade to Mode 1 only if the AR hardware support is confirmed and stable.

#### B. Firefighter Sender Page
This is the mobile page used by the firefighter’s phone. It should contain:
- a start camera button,
- session join/start controls,
- a stream health indicator,
- a preview thumbnail so the wearer or operator knows the camera is active,
- optional microphone toggle,
- optional “emergency marker” button.

This sender page can live in the same Next app for simplicity. That reduces the number of codebases and makes the hackathon flow easier to run.

### Layer 2: Auth0 Login

Auth0 should be used only where identity matters most: the commander/captain side. The firefighter phone may or may not need full login depending on demo scope.

A practical split is:
- Captain HUD routes require Auth0 login.
- Firefighter sender route can either use a protected access code or a simplified authenticated session.
- Backend session endpoints verify that the requester is allowed to create or view a stream.

The reason to put Auth0 primarily on the viewer side is that the commander role is the one the judges will associate with secure access control. It is also much easier to demo “captain logs in securely” than to require full authentication on every device role immediately.

Implementation in Next.js should include:
- Auth0 SDK dependency,
- login/logout routes,
- protected HUD route middleware,
- user/session display in the HUD header,
- role-based guard if multiple user types are needed later.

### Layer 3: Backend Signaling and Session APIs

The FastAPI backend in `backend/main.py` should be expanded into a small control API. It should not try to serve the UI. Its purpose is to coordinate sessions and telemetry.

Core API responsibilities:

#### Session Management
- create incident session,
- join session as sender or viewer,
- track who is currently connected,
- expose session metadata.

#### Signaling
If using WebRTC, devices need to exchange offers, answers, and ICE candidates. The backend can provide:
- `POST /api/sessions` to create a session,
- `POST /api/sessions/{id}/offer`,
- `POST /api/sessions/{id}/answer`,
- `POST /api/sessions/{id}/ice`,
- `GET /api/sessions/{id}` for current state.

An even smoother implementation could use WebSocket signaling, but a simple HTTP-based signaling flow is easier to implement first.

#### Telemetry
The backend should accept pulse and system telemetry through routes like:
- `POST /api/sessions/{id}/telemetry/pulse`,
- `GET /api/sessions/{id}/telemetry`,
- `POST /api/sessions/{id}/telemetry/device`.

It should also support scene-analysis and annotation data through routes like:
- `POST /api/sessions/{id}/annotations/arrows`,
- `GET /api/sessions/{id}/annotations`,
- `POST /api/sessions/{id}/scene/detections`,
- `GET /api/sessions/{id}/scene/state`.

This gives the frontend a stable source for overlay data even before the real pulse device integration is fully connected.

#### Health and Presence
The backend should expose:
- backend health status,
- session presence,
- last-seen timestamps for sender/viewer,
- signal quality summaries where available.

These are important for the demo because the HUD can visibly show “stream connected”, “pulse stale”, or “camera offline”. Judges usually respond well to systems that communicate degraded states clearly.

### Layer 4: Tailscale Security Model

Tailscale should be described and implemented as the secure network mesh between trusted devices. It is not replacing Auth0 and it is not replacing WebRTC.

The intended role of Tailscale is:
- securely connect the backend host and field devices,
- reduce exposure of services to the public internet,
- allow private addressing for the signaling and telemetry API,
- make the demo story stronger by emphasizing secure access between incident devices.

There are two likely ways to use it:

#### Option A: Tailscale only for backend/API access
The phone and HUD both reach the backend over the Tailnet. WebRTC signaling happens through that backend. Media may still go peer-to-peer if supported.

#### Option B: Tailscale for full device mesh
All participating devices are on the same Tailnet, allowing more direct connectivity and private routing for coordination services.

For the hackathon, Option A is easier to explain and more controllable. The pitch is: “All command infrastructure sits on a secure private Tailnet; only authenticated captains can access the stream control plane.”

### Layer 5: Pulse Detector / `persage` Integration

Right now, `persage` is still ambiguous. The implementation plan should treat it as a telemetry provider until its actual interface is confirmed.

There are three likely possibilities:

#### Possibility A: It exposes an HTTP API
The backend polls or receives webhooks from `persage` and stores the latest pulse values per firefighter session.

#### Possibility B: It is an SDK or device stream
The phone or backend runs a small adapter that converts raw readings into normalized telemetry.

#### Possibility C: It is not ready yet
Use a mock telemetry feed during the hackathon and keep the HUD contract stable. That means the UI and backend support pulse data now, and the real provider can be swapped in later.

Normalized pulse payload should look something like:
- firefighter ID,
- timestamp,
- heart rate,
- confidence,
- device status,
- alert level.

That normalized structure matters because it decouples the HUD from whichever sensor source is ultimately used.

### Layer 6: Spatial Guidance and Object Understanding

This is the new advanced part of the system: using the video feed not only to watch the firefighter’s point of view, but also to build helpful scene overlays.

There are two separate capabilities here:

#### Capability A: Commander-Placed Arrows and Breadcrumbs
The commander wants to place arrows on the floor to show how to retrace steps through a room. This can be implemented in a few progressively better ways.

##### Simple Hackathon Version
The commander clicks a point in the video and the system drops a directional arrow overlay at that approximate screen position. This arrow is stored as an annotation tied to the session and appears on the HUD.

This version is not truly mapped to the room, but it is fast to build and good enough to demonstrate the concept.

##### Better Version with Floor Estimation
The sender device estimates the floor region in the camera frame, either through AR APIs or computer vision. When the commander places an arrow, the system projects it onto the estimated floor plane. This makes the arrows feel more grounded.

##### Best Version with Spatial Anchoring
If the phone or glasses support AR tracking, the system can store arrows as world-space anchors with coordinates like position and rotation. Then the arrows remain attached to the same place in the room as the camera moves.

For implementation, arrow data should probably include:
- annotation ID,
- session ID,
- created by user,
- timestamp,
- position,
- rotation,
- type such as arrow, breadcrumb, or warning,
- confidence or anchoring mode.

The renderer in `three.js` should then use this data to draw directional meshes or decals.

#### Capability B: Room Scanning and Important Object Highlighting
This part is more than just graphics. It requires scene analysis.

The idea is to inspect the video feed and classify notable things in the room, such as:
- large obstacles blocking movement,
- tables, couches, cabinets, or other large objects,
- exits and doors,
- windows,
- people or human-shaped forms,
- equipment,
- valuable items or critical assets if the model is trained for them.

This should be framed carefully: `three.js` renders the highlights, but a detection pipeline produces the object data.

## How Room Scanning Should Actually Work

There are three realistic ways to implement room/object scanning, ordered from easiest demo to hardest real product.

### Option 1: 2D Object Detection on Video Frames
The phone or backend periodically samples frames from the live stream and runs an object-detection model. The model returns bounding boxes and labels, such as `chair`, `table`, `door`, or `person`. The HUD then draws highlights over those objects.

This is the fastest path for a hackathon because:
- it works with ordinary camera video,
- it does not require full 3D scene reconstruction,
- it can run with existing detection models,
- it is visually impressive enough for judges.

The tradeoff is that the system is recognizing objects in image space, not truly understanding the room in 3D.

### Option 2: 2.5D Scene Understanding with Depth Estimation
The system estimates approximate depth from the video or from sensors if available. That allows the HUD to reason about which objects are close, large, floor-mounted, or blocking a path.

This is better for navigation because “big object in the room” becomes more meaningful when the system knows relative distance and approximate scale.

### Option 3: Full 3D Scene Mapping / SLAM
The phone or AR device builds a 3D map of the room using AR frameworks or simultaneous localization and mapping. Objects are placed in true 3D coordinates and arrows are anchored in the space.

This is the most compelling long-term version, but also the hardest to stabilize quickly. It depends heavily on device capability and AR platform support.

For the hackathon, Option 1 is the best baseline, with a path toward Option 2 or 3 if hardware support is available.

## Recommended Technical Split for Scanning

To keep the architecture manageable, scene understanding should be split like this:

### On the Firefighter Phone
- capture frames,
- optionally downsample frames for analysis,
- send frames or analysis-ready images to the backend,
- provide pose/orientation metadata if available.

### On the Backend
- run or orchestrate object detection,
- normalize detections into a common schema,
- keep the latest scene state for the active session,
- expose detections to the HUD.

### On the HUD
- render boxes, labels, arrows, and markers,
- allow commander-created annotations,
- merge manual annotations with detected scene objects.

This split is useful because computer vision is often too heavy for the AR display layer. The display should mostly render results, not do expensive inference.

## Data Model for Object Highlighting

The object-highlighting payload should be normalized so the frontend does not care which model produced it. A useful shape would include:
- detection ID,
- session ID,
- timestamp,
- label,
- category such as obstacle, exit, person, asset, hazard,
- confidence score,
- 2D bounding box,
- optional 3D position,
- priority level,
- note or recommendation.

Examples of priority logic:
- large obstacle near path = high,
- visible exit door = high,
- downed person or person-shaped form = critical,
- couch or table = medium,
- uncertain object = low.

That enables the HUD to color-code objects and lets the commander quickly understand what matters.

## Commander Interaction Model for Arrows

The commander should be able to place directional guidance quickly without dealing with complex UI. The interaction model could be:

1. Pause or tap the active view.
2. Select “place arrow”.
3. Tap a point on the floor region.
4. Rotate the arrow direction with a drag gesture or quick preset.
5. Save the annotation to the session.
6. Render the arrow for all viewers of that session.

Possible arrow types:
- move forward,
- turn left,
- turn right,
- return path,
- avoid area,
- rescue target here.

For the hackathon, one simple directional arrow mesh plus a warning marker is enough. The value is in the interaction and visualization, not in a huge annotation palette.

## Detailed Data Flow

Here is the ideal end-to-end runtime flow:

1. Captain logs into the Next.js app with Auth0.
2. Captain creates or joins an incident session.
3. Firefighter phone opens the sender page and joins the same session.
4. The phone asks camera permission and starts a preview.
5. The sender page creates a WebRTC offer.
6. The offer is posted to the FastAPI backend.
7. The captain HUD retrieves the offer and returns an answer.
8. ICE candidates are exchanged until the peer connection is established.
9. The live stream appears on the commander HUD.
10. Video frames are optionally sampled for scene detection.
11. The detection pipeline returns objects, labels, and priorities.
12. The commander can place arrows or warnings onto the scene.
13. Pulse readings from `persage` flow into the backend or sender adapter.
14. The backend exposes the latest telemetry, detections, and annotations to the HUD.
15. The HUD overlays pulse, warnings, arrows, and object highlights on top of the live video.

This gives a very strong story: identity, secure network, live situational awareness, and biometric monitoring.

## What to Build First for the Hackathon

The best order of execution is the one that creates a believable demo as early as possible.

### Phase 1: Visual Demo Shell
Build the HUD UI in `my-app/app/page.tsx` or route it to a dedicated commander page. Add a fake video panel and fake vitals data first. This lets the team align on the experience immediately.

### Phase 2: Sender Page
Build the phone page with camera preview and a start-stream button. Even before full WebRTC, just proving camera access on mobile is useful.

### Phase 3: Session Backend
Expand `backend/main.py` with session creation and telemetry endpoints. This creates the shared source of truth.

### Phase 4: Real-Time Video
Connect sender and HUD with WebRTC signaling through the backend.

### Phase 5: Spatial Annotations
Add `three.js` or a compatible overlay layer for commander-placed arrows and warning markers. Start with 2D/perspective overlays tied to the video frame.

### Phase 6: Scene Detection
Add object-detection support so the system can highlight obstacles, exits, large objects, or potentially important targets.

### Phase 7: Auth0
Protect the captain routes, display the signed-in user, and make the secure-access story concrete.

### Phase 8: Pulse Integration
Wire in the real pulse source if available, otherwise keep the mock telemetry path so the overall experience remains complete.

## Important UX Decisions for AR

Because this is intended for glasses, not a laptop dashboard, the UI should follow a few rules:

- Keep text large and sparse.
- Use high-contrast overlays.
- Avoid tiny tables and dense controls.
- Prefer a small number of high-value metrics.
- Show the live feed as the main focal element.
- Treat alerts as obvious but not overwhelming.
- Make disconnect states explicit and readable.
- Make arrows and highlights large enough to read instantly.
- Avoid clutter when multiple objects are detected at once.
- Prioritize critical detections over decorative overlays.

The most compelling AR experience is not “a lot of information”. It is “the right information without blocking vision.”

## Technical Risks and Mitigations

### Risk 1: AR glasses browser limitations
Mitigation: build the HUD as a responsive web app that also works on a paired phone/browser mirrored to the glasses.

### Risk 2: WebRTC complexity
Mitigation: keep signaling minimal, support one sender and one viewer first, and avoid multi-party streaming for the hackathon version.

### Risk 3: `persage` uncertainty
Mitigation: define a stable internal telemetry schema and build a mock adapter first.

### Risk 4: Spatial anchoring may not work reliably on the demo hardware
Mitigation: start with 2D or pseudo-3D overlays and only enable true world-space anchors when the hardware proves it can support them.

### Risk 5: Object detection may be inaccurate in smoke, blur, or low light
Mitigation: treat detections as assistive hints, not authoritative truth, and expose confidence with conservative highlight behavior.

### Risk 6: Mobile camera permission issues
Mitigation: test on the exact phone/browser pair early and keep the sender page extremely simple.

### Risk 7: Network instability during demo
Mitigation: use Tailscale for secure backend reachability, expose clear connection states in the HUD, and keep a fallback simulated feed ready.

## Recommended Repo-Level Changes

### Frontend
- convert the placeholder `my-app/app/page.tsx` into a landing page or redirect,
- add dedicated routes for commander HUD and firefighter sender,
- add shared UI components for video panel, status badges, and vitals cards,
- add a `three.js` scene or overlay layer for arrows and object markers,
- add commander annotation tools for placing arrows and warnings,
- add Auth0 integration and protected routes.

### Backend
- refactor `backend/main.py` into session/signaling/telemetry routes,
- add CORS and environment-based configuration,
- add in-memory session state first, then upgrade if needed,
- add a simple telemetry mock route for development,
- add annotation and scene-detection endpoints,
- optionally add a frame-analysis worker or adapter.

### Documentation
- add a clear runbook for three devices: backend host, firefighter phone, and AR/judge viewer,
- document the Tailscale setup and device login steps,
- document Auth0 environment variables and callback URLs,
- document how to run with either real or mock pulse telemetry.

## Suggested Next Build Prompt

Implement a hackathon-ready firefighter commander HUD using the existing Next.js frontend and FastAPI backend. Create a commander HUD route optimized for AR glasses, a mobile sender route for the firefighter phone, WebRTC-based live video streaming with backend signaling, Auth0 login for captain access, Tailscale-friendly private API configuration, a `three.js`-powered annotation layer for commander-placed arrows and breadcrumbs, and a scene-understanding layer that can highlight important objects such as obstacles, exits, large furniture, or rescue-relevant items. Support both mocked pulse readings and future integration with `persage`. Prioritize a working one-sender/one-viewer demo with clear connection states, large readable overlays, fallback 2D annotation behavior when true AR anchoring is unavailable, and documentation for running the system on three devices.

## Open Questions to Confirm

1. What exact AR glasses are being used, and do they have a browser or do they mirror a phone?
2. Is `persage` the exact correct name, and do you have API docs or sample payloads?
3. Does the firefighter phone need full authentication, or only the captain HUD?
4. Do you want one firefighter stream only, or support for multiple firefighters later?
5. Is two-way audio needed, or only one-way live video plus pulse?
6. Do you want the arrows to be true world-anchored AR objects, or is a visually convincing video overlay enough for the hackathon?
7. Do you already have a model or service in mind for object detection, or should the system start with generic room-object detection and manual priority tagging?
