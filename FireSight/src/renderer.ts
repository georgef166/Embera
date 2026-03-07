import * as cocoSsd from '@tensorflow-models/coco-ssd';

/**
 * Draw bounding boxes around detected objects.
 */
export function drawBoundingBoxes(ctx: CanvasRenderingContext2D, predictions: cocoSsd.DetectedObject[]) {
    ctx.font = 'bold 14px "Courier New"';
    ctx.textBaseline = 'top';

    predictions.forEach(prediction => {
        const isVictim = prediction.class === 'person';
        const isExit = prediction.class === 'stop sign'; // Mocked exit

        if (!isVictim && !isExit) return;

        const color = isVictim ? '#FFD700' : '#00FF00';
        const labelText = isVictim ? `VICTIM [${Math.round(prediction.score * 100)}%]` : `EXIT [${Math.round(prediction.score * 100)}%]`;

        const [x, y, width, height] = prediction.bbox;
        const cornerLen = 20;

        // Draw Tactical Corners (instead of full box)
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Top Left
        ctx.moveTo(x, y + cornerLen);
        ctx.lineTo(x, y);
        ctx.lineTo(x + cornerLen, y);
        // Top Right
        ctx.moveTo(x + width - cornerLen, y);
        ctx.lineTo(x + width, y);
        ctx.lineTo(x + width, y + cornerLen);
        // Bottom Right
        ctx.moveTo(x + width, y + height - cornerLen);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x + width - cornerLen, y + height);
        // Bottom Left
        ctx.moveTo(x + cornerLen, y + height);
        ctx.lineTo(x, y + height);
        ctx.lineTo(x, y + height - cornerLen);
        ctx.stroke();

        // Optional: faint full box
        ctx.strokeStyle = `${color}44`; // 25% opacity
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);

        // Draw background for label
        const pad = 4;
        const textWidth = ctx.measureText(labelText).width;
        const textHeight = 14;

        ctx.fillStyle = color;
        ctx.fillRect(x, y - textHeight - (pad * 2), textWidth + (pad * 2), textHeight + (pad * 2));

        // Draw Label Text
        ctx.fillStyle = '#000000';
        ctx.fillText(labelText, x + pad, y - textHeight - pad);

        // Target crosshair in center
        const cx = x + width / 2;
        const cy = y + height / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
        ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

/**
 * Draw Reticle / Viewport Center Point 
 */
export function drawReticle(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const size = 30;

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
    ctx.lineWidth = 2;

    // Outer circle
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, 2 * Math.PI);
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - size - 10, cy); ctx.lineTo(cx - 10, cy);
    ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + size + 10, cy);
    ctx.moveTo(cx, cy - size - 10); ctx.lineTo(cx, cy - 10);
    ctx.moveTo(cx, cy + 10); ctx.lineTo(cx, cy + size + 10);
    ctx.stroke();
}
