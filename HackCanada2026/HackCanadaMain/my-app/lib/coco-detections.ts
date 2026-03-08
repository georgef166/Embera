import type { Detection, Priority } from "@/lib/types";

export interface CocoPrediction {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

const criticalClasses = new Set(["person"]);
const highPriorityClasses = new Set([
  "bicycle",
  "bus",
  "car",
  "motorcycle",
  "train",
  "truck",
]);

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function resolvePriority(label: string, confidence: number): Priority {
  if (criticalClasses.has(label)) {
    return "critical";
  }

  if (highPriorityClasses.has(label)) {
    return "high";
  }

  if (confidence >= 0.8) {
    return "medium";
  }

  return "low";
}

export function mapPredictionsToDetections(
  predictions: CocoPrediction[],
  videoWidth: number,
  videoHeight: number,
): Detection[] {
  if (!videoWidth || !videoHeight) {
    return [];
  }

  return predictions.map((prediction, index) => {
    const [rawX, rawY, rawWidth, rawHeight] = prediction.bbox;
    const x = clampPercent((rawX / videoWidth) * 100);
    const y = clampPercent((rawY / videoHeight) * 100);
    const width = clampPercent((rawWidth / videoWidth) * 100);
    const height = clampPercent((rawHeight / videoHeight) * 100);
    const boundedWidth = Math.min(width, 100 - x);
    const boundedHeight = Math.min(height, 100 - y);
    const confidence = Math.round(prediction.score * 100);

    return {
      id: `${prediction.class}-${index}-${Math.round(rawX)}-${Math.round(rawY)}`,
      label: prediction.class,
      category: "live detection",
      description: `${confidence}% confidence`,
      priority: resolvePriority(prediction.class, prediction.score),
      confidence: prediction.score,
      x,
      y,
      width: boundedWidth,
      height: boundedHeight,
    };
  });
}
