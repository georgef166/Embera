const { WebSocketServer } = require('ws');

// Create a WebSocket server listening on port 8080
const wss = new WebSocketServer({ port: 8080 });

console.log('Embera WebSocket Server is running on ws://localhost:8080');

// Listen for new connections (e.g., from the Watch App or the AR HUD)
wss.on('connection', function connection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    console.log(`[+] New client connected from ${clientIp}`);

    // Listen for incoming messages from the watch
    ws.on('message', function message(data, isBinary) {
        if (isBinary) {
            // Received raw audio PCM bytes
            console.log(`[AUDIO] Received ${data.length} bytes of raw audio stream`);
            // TODO: write to file, pipe to transcribe service, or broadcast to HUD!
            return;
        }

        try {
            // The watch sends a JSON string
            const biometricData = JSON.parse(data.toString());

            // Log the incoming data clearly to the terminal
            console.log('\n--- Incoming Telemetry ---');
            console.log(`HR:   ${biometricData.heartRate} bpm`);
            console.log(`SpO2: ${biometricData.oxygenSaturation.toFixed(1)}%`);
            console.log(`Temp: ${biometricData.skinTemperature.toFixed(1)}°C`);
            console.log(`GPS:  ${biometricData.latitude.toFixed(5)}, ${biometricData.longitude.toFixed(5)}`);
            console.log(`Down: ${biometricData.isManDown}`);

            // TODO: In the future, we would re-broadcast this to the AR HUD here!

        } catch (e) {
            console.log(`[!] Received non-JSON text message: ${data}`);
        }
    });

    // Handle client disconnects
    ws.on('close', () => {
        console.log(`[-] Client disconnected (${clientIp})`);
    });

    // Handle socket errors
    ws.on('error', (err) => {
        console.error(`[!] WebSocket Error:`, err);
    });
});
