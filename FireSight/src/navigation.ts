/**
 * Navigation module to drop breadcrumbs using orientation and simulated motion.
 */

interface Point {
    x: number;
    y: number;
    alpha: number;
    scale: number;
}

const breadcrumbs: Point[] = [];
let frames = 0;
let currentHeading = 0; // Compass heading mock

/**
* Tracks orientation and drops a point behind the user.
*/
export function updateBreadcrumbs(canvas: HTMLCanvasElement) {
    frames++;
    if (frames % 45 === 0) { // Drop a crumb 
        // Emitted right below the reticle
        breadcrumbs.push({
            x: canvas.width / 2,
            y: canvas.height * 0.7,
            alpha: 1.0,
            scale: 1.0
        });
    }

    // Drift crumbs down to simulate moving forward
    for (let i = breadcrumbs.length - 1; i >= 0; i--) {
        let crumb = breadcrumbs[i];
        crumb.y += 2; // move down screen
        crumb.x += (Math.random() - 0.5); // Slight drift
        crumb.alpha -= 0.003;
        crumb.scale *= 1.01; // slightly enlarge as it "gets closer to feet"

        if (crumb.alpha <= 0 || crumb.y > canvas.height + 50) {
            breadcrumbs.splice(i, 1);
        }
    }
}

/**
* Renders the breadcrumb trail and exit arrow.
*/
export function drawBreadcrumbs(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    // Draw dots
    breadcrumbs.forEach(crumb => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(crumb.x, crumb.y, 6 * crumb.scale, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(0, 255, 255, ${crumb.alpha})`; // Cyan trail
        ctx.fill();
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'cyan';
        ctx.restore();
    });

    // Navigation Arrow (HUD bottom center)
    const arrowX = canvas.width / 2;
    const arrowY = canvas.height - 80;

    ctx.save();
    ctx.translate(arrowX, arrowY);
    // Rotate based on heading (Mock heading sway for demo + actual heading)
    // Convert heading degrees to radians for canvas rotation
    const headingRadians = currentHeading * (Math.PI / 180);
    ctx.rotate(Math.sin(frames * 0.05) * 0.3 + headingRadians);

    ctx.beginPath();
    ctx.moveTo(0, -30); // tip
    ctx.lineTo(20, 10);
    ctx.lineTo(10, 10);
    ctx.lineTo(10, 30);
    ctx.lineTo(-10, 30);
    ctx.lineTo(-10, 10);
    ctx.lineTo(-20, 10);
    ctx.closePath();

    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.rotate(0); // reset inside rotation
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 16px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('EVAC', 0, 50);
    ctx.restore();
}

/**
* Listen to device orientation to aim navigation arrow.
*/
window.addEventListener('deviceorientation', (event) => {
    if (event.alpha !== null) {
        currentHeading = event.alpha;
    }
});
