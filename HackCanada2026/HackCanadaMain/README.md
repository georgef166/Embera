<div align="center">
  <h1>🔥 Ember</h1>
  <h3><i>Winner of the Google "Build with AI" Prize at HackCanada 2026</i></h3>
</div>

<br />

Ember is an AR-empowered wearable and HUD ecosystem for firefighters that combines live video feeds with real-time biometric telemetry and scene understanding to give commanders enhanced situational awareness in dangerous environments.

---

## 💡 How It Works

Ember connects field personnel (equipped with a body-worn camera and an Android Wear OS smartwatch) to command center personnel wearing an AR display or viewing a dashboard. 

1. **Watch Telemetry:** The smartwatch operates a resilient foreground service utilizing Kotlin Coroutines to continuously collect vital biometrics, including real heart rate via the Android Health Services API, fused location data, device compass heading, and live audio streaming. This high-frequency telemetry payload is instantly serialized and pushed to the backend via a Ktor-based WebSocket client that maintains a persistent, auto-reconnecting stream.
2. **Body Cam Video:** The system leverages WebRTC for low-latency live video streaming directly from the firefighter's body-worn device to the commander HUD.
3. **AI Scene Understanding & Navigation:** To assist with hazards and navigation, the frontend employs a custom contour detection system. It leverages the browser's Canvas API to perform real-time pixel-wise analysis, scanning the incoming WebRTC video frames for high-contrast edges and drawing neon-green topological outlines, thereby artificially enhancing visibility in smoke-filled or low-light conditions. Concurrently, TensorFlow.js with the COCO-SSD object detection model runs locally in the browser to identify large obstacles, exits, and people-sized shapes. The HUD also uses `three.js` to render interactive 3D spatial overlays such as navigational breadcrumbs and warning markers.
4. **Secure Infrastructure:** To ensure operational security, Auth0 is used for captain access control, and a Tailscale private mesh network is deployed to secure all connectivity between the command center, the backend API, and the field devices natively. The Tailscale setup ensures that the signaling server and telemetry endpoints are only accessible by authenticated nodes on the Tailnet, completely eliminating the need to expose sensitive APIs to the public internet.

---

## 🛠️ Tech Stack

- **Frontend (Commander HUD & Sender):** Next.js, React, Tailwind CSS, built-in WebRTC, three.js for 3D spatial overlays, HTML Canvas API
- **AI & Computer Vision:** TensorFlow.js, COCO-SSD Object Detection Model, Custom Contour Edge Detection algorithm
- **Backend (Signaling & Telemetry):** Python, FastAPI, WebSockets
- **Watch App (Biometrics):** Kotlin, Android Wear OS, Health Services API, Ktor WebSockets
- **Security & Identity:** Auth0, Tailscale (Private Mesh Network)

---

## 🚀 Getting Started

This repository contains the Next.js frontend (`my-app/`), the Python FastAPI backend (`backend/`), and the Android Kotlin Wear OS app (`watch-app/`).

### Prerequisites
- Node.js (v20+)
- Python 3.10+
- Android Studio (for Watch App development)
- Tailscale (installed and configured on all devices for the mesh network)

### 1. Install Workspace Dependencies
From the root directory (`HackCanadaMain/`), install the Node workspace dependencies:

```bash
npm install
```

### 2. Run the Frontend (Commander HUD)
The Next.js app will run using the root workspace scripts:

```bash
npm run dev
```

### 3. Run the Backend API
Start the FastAPI backend server (which handles WebRTC signaling and WebSocket telemetry):

```bash
npm run backend:dev
```
*(Alternatively, you can run `python3 backend/main.py` directly).*

### 4. Deploy the Watch App
Open the `watch-app/` directory in Android Studio. Ensure that the IP Address in `MainActivity.kt` points to your backend machine's Tailscale IP, then build and deploy the APK to a physical Android/Wear OS device or emulator.
