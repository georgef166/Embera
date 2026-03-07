import { setupCamera } from './camera';
import { loadModel, detectObjects } from './detection';
import { drawBoundingBoxes, drawReticle } from './renderer';
import { processSobelFilter, drawSobelOverlay } from './filters';
import { updateBreadcrumbs, drawBreadcrumbs } from './navigation';
import { applySmokeEffect } from './smoke';

const video = document.getElementById('webcam') as HTMLVideoElement;
const canvas = document.getElementById('ar-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
let isModelReady = false;
let frameCount = 0;

async function bootstrap() {
    // 1. Setup Camera
    await setupCamera(video);

    // Set canvas perfectly to the screen size to avoid fuzzy scaling
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    // 2. Load AI Model
    const modelStatus = document.getElementById('model-status')!;
    try {
        await loadModel();
        isModelReady = true;
        modelStatus.innerText = 'AI: READY';
        modelStatus.style.color = '#00FF00';
        modelStatus.style.borderColor = '#00FF00';
    } catch (err) {
        modelStatus.innerText = 'AI: FAILED';
        modelStatus.style.color = '#FF0000';
        modelStatus.style.borderColor = '#FF0000';
        console.error('Failed to load model', err);
    }

    // 3. Start render loop
    requestAnimationFrame(renderLoop);
}

async function renderLoop() {
    frameCount++;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw raw video feed centered and scaled
    // Draw the video to fill the screen (cover behavior)
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const x = (canvas.width / 2) - (video.videoWidth / 2) * scale;
    const y = (canvas.height / 2) - (video.videoHeight / 2) * scale;

    ctx.drawImage(video, x, y, video.videoWidth * scale, video.videoHeight * scale);

    // 2. Edge Detection (Structure) - Run BEFORE smoke so it can see the actual room
    // Run every 2 frames to save battery/performance on mobile
    if (frameCount % 2 === 0) {
        processSobelFilter(canvas);
    }

    // 3. Smoke Simulation Layer (Oscures raw video but we can draw things on top of it)
    applySmokeEffect(ctx, canvas);

    // 4. Redraw the Edge Detection ON TOP of the smoke
    drawSobelOverlay(ctx, canvas);

    // 4. Object Detection (Victims & Exits)
    if (isModelReady) {
        // Note: We don't await this so it doesn't block the 60fps loop.
        // Detection resolves asynchronously and updates internal state shown on next frame
        const predictions = await detectObjects(video);

        // Predictions give bounding boxes based on the raw video dimensions. 
        // We need to scale them up to the canvas dimensions we just drew.
        const scaledPredictions = predictions.map(p => {
            return {
                ...p,
                bbox: [
                    x + (p.bbox[0] * scale),
                    y + (p.bbox[1] * scale),
                    p.bbox[2] * scale,
                    p.bbox[3] * scale
                ] as [number, number, number, number]
            };
        });

        drawBoundingBoxes(ctx, scaledPredictions);
    }

    // 5. Navigation & Breadcrumbs
    updateBreadcrumbs(canvas);
    drawBreadcrumbs(ctx, canvas);
    drawReticle(ctx, canvas);

    requestAnimationFrame(renderLoop);
}

// Start the app when DOM is ready
bootstrap();
