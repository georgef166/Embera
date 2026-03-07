/**
 * Smoke effect simulator to prove the "seeing through dark smoke" feature.
 * When enabled, darkens and blurs the raw video feed BEFORE drawing AI overlays.
 */

export function applySmokeEffect(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    // We simulate heavy smoke by drawing a dark, slightly transparent gradient
    // or flat fill over the canvas. We don't blur the canvas itself as that drops
    // FPS significantly on mobile CPUs. Instead we just overlay darkness.

    ctx.fillStyle = 'rgba(10, 15, 10, 0.9)'; // 90% opacity near-black smoke
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Optional: Add some "flicker" or gradient to make it feel dynamic
    const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.5)'); // Even darker at edges

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}
