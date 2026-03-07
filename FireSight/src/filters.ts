/**
 * Applies a basic Edge Detection (Sobel) filter to the canvas to outline walls and obstacles.
 * Uses a 3x3 convolution kernel over the pixel data.
 */

// Offscreen canvas for downsampling and processing to save performance
let offscreenCanvas: HTMLCanvasElement;
let offscreenCtx: CanvasRenderingContext2D;
const DOWNSCALE_FACTOR = 0.5; // Process at half resolution for speed

export function processSobelFilter(canvas: HTMLCanvasElement) {
    if (!offscreenCanvas) {
        offscreenCanvas = document.createElement('canvas');
        offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true })!;
    }

    const processWidth = Math.floor(canvas.width * DOWNSCALE_FACTOR);
    const processHeight = Math.floor(canvas.height * DOWNSCALE_FACTOR);

    // Only resize if dimensions changed
    if (offscreenCanvas.width !== processWidth) {
        offscreenCanvas.width = processWidth;
        offscreenCanvas.height = processHeight;
    }

    // Draw downscaled current canvas to offscreen (which currently holds the RAW video before smoke)
    offscreenCtx.drawImage(canvas, 0, 0, processWidth, processHeight);

    // 2. Extract pixel data
    const imgData = offscreenCtx.getImageData(0, 0, processWidth, processHeight);
    const src = imgData.data;
    const output = new ImageData(processWidth, processHeight);
    const dst = output.data;

    const w = processWidth;
    const h = processHeight;

    // Sobel kernels
    const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    // Helper to get pixel intensity (grayscale)
    const getIntensity = (x: number, y: number) => {
        if (x < 0 || x >= w || y < 0 || y >= h) return 0;
        const offset = (y * w + x) * 4;
        // Fast luminance
        return (src[offset] * 0.299 + src[offset + 1] * 0.587 + src[offset + 2] * 0.114);
    };

    // 3. Apply Kernel (skip outmost border pixels for speed/safety)
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            let pixelX = 0;
            let pixelY = 0;

            // 3x3 convolution
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const intensity = getIntensity(x + kx, y + ky);
                    const weightX = kernelX[(ky + 1) * 3 + (kx + 1)];
                    const weightY = kernelY[(ky + 1) * 3 + (kx + 1)];
                    pixelX += intensity * weightX;
                    pixelY += intensity * weightY;
                }
            }

            // Magnitude
            const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);

            // Lowered threshold slightly so more edges are picked up
            const val = magnitude > 70 ? 255 : 0;

            const offset = (y * w + x) * 4;
            // We want white edges on a transparent background so it overlays nicely.
            // If it's an edge, draw it white and opaque. Otherwise transparent.
            dst[offset] = 255;     // R
            dst[offset + 1] = 255;   // G
            dst[offset + 2] = 255;   // B
            dst[offset + 3] = val;   // Alpha (255 if edge, 0 if not)
        }
    }

    // 4. Put processed data back to offscreen
    offscreenCtx.putImageData(output, 0, 0);
}

export function drawSobelOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    if (offscreenCanvas) {
        ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
    }
}
