/**
 * Requests the rear-facing camera and attaches it to the video element.
 */
export async function setupCamera(videoElement: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser API navigator.mediaDevices.getUserMedia not available');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            facingMode: 'environment', // Request back camera
            width: { ideal: 640 },     // Optimize for speed in TF.js
            height: { ideal: 480 }
        }
    });

    videoElement.srcObject = stream;

    return new Promise((resolve) => {
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            resolve();
        };
    });
}
