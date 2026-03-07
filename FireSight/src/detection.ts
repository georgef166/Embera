import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

let model: cocoSsd.ObjectDetection;
let lastPredictions: cocoSsd.DetectedObject[] = [];
let isPredicting = false;

/**
 * Load the MobileNet-based COCO-SSD model.
 */
export async function loadModel() {
    model = await cocoSsd.load();
    console.log('COCO-SSD model loaded');
}

/**
 * Run object detection on the current video frame.
 * Does not block the main loop by skipping frames while predicting.
 */
export async function detectObjects(video: HTMLVideoElement): Promise<cocoSsd.DetectedObject[]> {
    if (!model) return [];

    // Throttle predictions so we don't stall the render thread
    if (!isPredicting) {
        isPredicting = true;
        // We don't await this so the render loop continues with the old predictions
        model.detect(video).then(predictions => {
            lastPredictions = predictions;
            isPredicting = false;
        });
    }

    // We filter to specific targets relevant to firefighters (e.g., 'person', 'stop sign' for exit mocking)
    return lastPredictions.filter((p: any) => p.class === 'person' || p.class === 'stop sign');
}
