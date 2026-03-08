export enum ViewMode {
  REGULAR,
  CONTOUR,
  THERMAL,
}

interface CocoPrediction {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

interface DetectionModel {
  detect(input: HTMLCanvasElement | HTMLVideoElement): Promise<CocoPrediction[]>;
}

interface StartFireSightPublisherUiOptions {
  canvasElement: HTMLCanvasElement;
  onModelStatusChange?: (status: string) => void;
  onSystemStatusChange?: (status: string) => void;
  stream: MediaStream;
  videoElement: HTMLVideoElement;
}

interface VideoDisplayRect {
  height: number;
  scale: number;
  width: number;
  x: number;
  y: number;
}

interface AnalysisFrame {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  height: number;
  scaleX: number;
  scaleY: number;
  width: number;
}

interface PerformanceBudget {
  analysisMaxDimension: number;
  detectionFps: number;
  edgeFps: number;
}

type VideoFrameCapableElement = HTMLVideoElement & {
  cancelVideoFrameCallback?: (handle: number) => void;
  requestVideoFrameCallback?: (
    callback: (now: DOMHighResTimeStamp, metadata: unknown) => void,
  ) => number;
};

const DETECTION_CLASSES = new Set(["person", "stop sign"]);
const DETECTION_ENABLED_BY_DEFAULT = true;
const ANALYSIS_DIMENSION_STEPS = [384, 320, 256];
const DETECTION_FPS_STEPS = [3, 2, 1];
const EDGE_ANALYSIS_SCALE = 0.5;
const EDGE_FPS_STEPS = [60, 30, 15, 5];
const LOW_FPS_THRESHOLD = 28;
const PERFORMANCE_WINDOW_MS = 1_500;

let detectionModelPromise: Promise<DetectionModel> | null = null;

function scalePrediction(
  prediction: CocoPrediction,
  drawX: number,
  drawY: number,
  scale: number,
): CocoPrediction {
  return {
    ...prediction,
    bbox: [
      drawX + prediction.bbox[0] * scale,
      drawY + prediction.bbox[1] * scale,
      prediction.bbox[2] * scale,
      prediction.bbox[3] * scale,
    ],
  };
}

function scalePredictionToSource(
  prediction: CocoPrediction,
  scaleX: number,
  scaleY: number,
): CocoPrediction {
  return {
    ...prediction,
    bbox: [
      prediction.bbox[0] * scaleX,
      prediction.bbox[1] * scaleY,
      prediction.bbox[2] * scaleX,
      prediction.bbox[3] * scaleY,
    ],
  };
}

function drawBoundingBoxes(
  context: CanvasRenderingContext2D,
  predictions: CocoPrediction[],
) {
  context.font = 'bold 14px "Courier New", monospace';
  context.textBaseline = "top";

  for (const prediction of predictions) {
    const isVictim = prediction.class === "person";
    const isExit = prediction.class === "stop sign";

    if (!isVictim && !isExit) {
      continue;
    }

    const color = isVictim ? "#ffd700" : "#00ff85";
    const labelText = isVictim
      ? `VICTIM [${Math.round(prediction.score * 100)}%]`
      : `EXIT [${Math.round(prediction.score * 100)}%]`;
    const [x, y, width, height] = prediction.bbox;
    const cornerLength = 20;

    context.strokeStyle = color;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x, y + cornerLength);
    context.lineTo(x, y);
    context.lineTo(x + cornerLength, y);
    context.moveTo(x + width - cornerLength, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width, y + cornerLength);
    context.moveTo(x + width, y + height - cornerLength);
    context.lineTo(x + width, y + height);
    context.lineTo(x + width - cornerLength, y + height);
    context.moveTo(x + cornerLength, y + height);
    context.lineTo(x, y + height);
    context.lineTo(x, y + height - cornerLength);
    context.stroke();

    context.strokeStyle = `${color}44`;
    context.lineWidth = 1;
    context.strokeRect(x, y, width, height);

    const labelPadding = 4;
    const textWidth = context.measureText(labelText).width;
    const textHeight = 14;

    context.fillStyle = color;
    context.fillRect(
      x,
      y - textHeight - labelPadding * 2,
      textWidth + labelPadding * 2,
      textHeight + labelPadding * 2,
    );

    context.fillStyle = "#000";
    context.fillText(labelText, x + labelPadding, y - textHeight - labelPadding);

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    context.beginPath();
    context.moveTo(centerX - 10, centerY);
    context.lineTo(centerX + 10, centerY);
    context.moveTo(centerX, centerY - 10);
    context.lineTo(centerX, centerY + 10);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
  }
}

function drawReticle(
  context: CanvasRenderingContext2D,
  canvasElement: HTMLCanvasElement,
) {
  const centerX = canvasElement.width / 2;
  const centerY = canvasElement.height / 2;
  const size = 30;

  context.strokeStyle = "rgba(0, 255, 133, 0.65)";
  context.lineWidth = 2;

  context.beginPath();
  context.arc(centerX, centerY, size, 0, 2 * Math.PI);
  context.stroke();

  context.beginPath();
  context.moveTo(centerX - size - 10, centerY);
  context.lineTo(centerX - 10, centerY);
  context.moveTo(centerX + 10, centerY);
  context.lineTo(centerX + size + 10, centerY);
  context.moveTo(centerX, centerY - size - 10);
  context.lineTo(centerX, centerY - 10);
  context.moveTo(centerX, centerY + 10);
  context.lineTo(centerX, centerY + size + 10);
  context.stroke();
}

function applySmokeEffect(
  context: CanvasRenderingContext2D,
  canvasElement: HTMLCanvasElement,
) {
  context.fillStyle = "rgba(10, 15, 10, 0.9)";
  context.fillRect(0, 0, canvasElement.width, canvasElement.height);

  const gradient = context.createRadialGradient(
    canvasElement.width / 2,
    canvasElement.height / 2,
    0,
    canvasElement.width / 2,
    canvasElement.height / 2,
    canvasElement.width,
  );

  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.5)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvasElement.width, canvasElement.height);
}

function ensureCanvasSize(canvasElement: HTMLCanvasElement) {
  if (
    canvasElement.width !== window.innerWidth ||
    canvasElement.height !== window.innerHeight
  ) {
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
  }
}

function getVideoDisplayRect(
  canvasElement: HTMLCanvasElement,
  videoElement: HTMLVideoElement,
): VideoDisplayRect | null {
  if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    return null;
  }

  const scale = Math.max(
    canvasElement.width / videoElement.videoWidth,
    canvasElement.height / videoElement.videoHeight,
  );
  const width = videoElement.videoWidth * scale;
  const height = videoElement.videoHeight * scale;

  return {
    height,
    scale,
    width,
    x: canvasElement.width / 2 - width / 2,
    y: canvasElement.height / 2 - height / 2,
  };
}

function getContainedDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
) {
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));

  return {
    height: Math.max(1, Math.round(sourceHeight * scale)),
    width: Math.max(1, Math.round(sourceWidth * scale)),
  };
}

function getPerformanceBudget() {
  return {
    analysisMaxDimension: ANALYSIS_DIMENSION_STEPS[0],
    detectionFps: DETECTION_FPS_STEPS[0],
    edgeFps: EDGE_FPS_STEPS[0],
  };
}

function degradePerformanceBudget(
  budget: PerformanceBudget,
  currentIndices: {
    analysis: number;
    detection: number;
    edge: number;
  },
) {
  if (currentIndices.edge < EDGE_FPS_STEPS.length - 1) {
    currentIndices.edge += 1;
    budget.edgeFps = EDGE_FPS_STEPS[currentIndices.edge];

    return `edge-fps=${budget.edgeFps}`;
  }

  if (currentIndices.analysis < ANALYSIS_DIMENSION_STEPS.length - 1) {
    currentIndices.analysis += 1;
    budget.analysisMaxDimension = ANALYSIS_DIMENSION_STEPS[currentIndices.analysis];

    return `analysis-max=${budget.analysisMaxDimension}`;
  }

  if (currentIndices.detection < DETECTION_FPS_STEPS.length - 1) {
    currentIndices.detection += 1;
    budget.detectionFps = DETECTION_FPS_STEPS[currentIndices.detection];

    return `detection-fps=${budget.detectionFps}`;
  }

  return null;
}

async function attachStreamToVideo(
  videoElement: HTMLVideoElement,
  stream: MediaStream,
) {
  videoElement.srcObject = stream;

  if (videoElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
    await videoElement.play().catch(() => { });
    return;
  }

  await new Promise<void>((resolve) => {
    const handleLoadedMetadata = () => {
      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      void videoElement.play().catch(() => { });
      resolve();
    };

    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
  });
}

async function getDetectionModel() {
  if (!detectionModelPromise) {
    detectionModelPromise = (async () => {
      await Promise.all([
        import("@tensorflow/tfjs-backend-cpu"),
        import("@tensorflow/tfjs-backend-webgl"),
      ]);
      const cocoSsd = await import("@tensorflow-models/coco-ssd");

      return cocoSsd.load({
        base: "mobilenet_v2",
      });
    })();
  }

  return detectionModelPromise;
}

export async function startFireSightPublisherUi({
  canvasElement,
  onModelStatusChange,
  onSystemStatusChange,
  stream,
  videoElement,
}: StartFireSightPublisherUiOptions): Promise<{ stop: () => void; setViewMode: (mode: ViewMode) => void }> {
  let currentViewMode = ViewMode.CONTOUR;

  const setViewMode = (mode: ViewMode) => {
    currentViewMode = mode;
  };

  const context = canvasElement.getContext("2d");

  if (!context) {
    throw new Error("The FireSight overlay canvas could not be initialized.");
  }

  await attachStreamToVideo(videoElement, stream);

  const videoWithFrameCallback = videoElement as VideoFrameCapableElement;
  const performanceBudget = getPerformanceBudget();
  const performanceStepIndices = {
    analysis: 0,
    detection: 0,
    edge: 0,
  };
  const supportsVideoFrameCallback =
    typeof videoWithFrameCallback.requestVideoFrameCallback === "function";

  let isStopped = false;
  let animationFrameId = 0;
  let detectionFailed = false;
  let detectionReady = false;
  let detectionInFlight = false;
  let fpsWindowFrameCount = 0;
  let fpsWindowStartedAt = performance.now();
  let lastDetectionAt = Number.NEGATIVE_INFINITY;
  let lastEdgeProcessedAt = Number.NEGATIVE_INFINITY;
  let lastPredictions: CocoPrediction[] = [];
  let analysisCanvas: HTMLCanvasElement | null = null;
  let analysisContext: CanvasRenderingContext2D | null = null;
  let detectionCanvas: HTMLCanvasElement | null = null;
  let detectionContext: CanvasRenderingContext2D | null = null;
  let edgeCanvas: HTMLCanvasElement | null = null;
  let edgeContext: CanvasRenderingContext2D | null = null;
  let edgeOutputImageData: ImageData | null = null;
  let latestVideoFrameSerial = 1;
  let lastCapturedVideoFrameSerial = -1;
  let lastCapturedVideoTime = Number.NEGATIVE_INFINITY;
  let pendingVideoFrameCallbackId = 0;

  const scheduleNextVideoFrame = () => {
    if (isStopped || !supportsVideoFrameCallback) {
      return;
    }

    pendingVideoFrameCallbackId =
      videoWithFrameCallback.requestVideoFrameCallback?.(() => {
        latestVideoFrameSerial += 1;
        scheduleNextVideoFrame();
      }) ?? 0;
  };

  const stop = () => {
    if (isStopped) {
      return;
    }

    isStopped = true;
    window.cancelAnimationFrame(animationFrameId);
    window.removeEventListener("resize", handleResize);

    if (supportsVideoFrameCallback && pendingVideoFrameCallbackId !== 0) {
      videoWithFrameCallback.cancelVideoFrameCallback?.(pendingVideoFrameCallbackId);
    }

    if (videoElement.srcObject === stream) {
      videoElement.srcObject = null;
    }

    videoElement.pause();
  };

  const handleResize = () => {
    ensureCanvasSize(canvasElement);
  };

  const ensureAnalysisFrame = (): AnalysisFrame | null => {
    if (
      videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      return null;
    }

    if (!analysisCanvas || !analysisContext) {
      analysisCanvas = document.createElement("canvas");
      analysisContext = analysisCanvas.getContext("2d", {
        willReadFrequently: true,
      });
    }

    if (!analysisCanvas || !analysisContext) {
      return null;
    }

    const analysisSize = getContainedDimensions(
      videoElement.videoWidth,
      videoElement.videoHeight,
      performanceBudget.analysisMaxDimension,
    );
    const needsResize =
      analysisCanvas.width !== analysisSize.width ||
      analysisCanvas.height !== analysisSize.height;
    const shouldCaptureNewFrame = supportsVideoFrameCallback
      ? lastCapturedVideoFrameSerial !== latestVideoFrameSerial
      : lastCapturedVideoTime !== videoElement.currentTime;

    if (needsResize) {
      analysisCanvas.width = analysisSize.width;
      analysisCanvas.height = analysisSize.height;
    }

    if (needsResize || shouldCaptureNewFrame || lastCapturedVideoFrameSerial < 0) {
      analysisContext.drawImage(
        videoElement,
        0,
        0,
        analysisSize.width,
        analysisSize.height,
      );
      lastCapturedVideoFrameSerial = latestVideoFrameSerial;
      lastCapturedVideoTime = videoElement.currentTime;
    }

    return {
      canvas: analysisCanvas,
      context: analysisContext,
      height: analysisCanvas.height,
      scaleX: videoElement.videoWidth / analysisCanvas.width,
      scaleY: videoElement.videoHeight / analysisCanvas.height,
      width: analysisCanvas.width,
    };
  };

  const processSobelFilter = (displayRect: VideoDisplayRect) => {
    if (!edgeCanvas || !edgeContext) {
      edgeCanvas = document.createElement("canvas");
      edgeContext = edgeCanvas.getContext("2d", {
        willReadFrequently: true,
      });
    }

    if (!edgeCanvas || !edgeContext) {
      return;
    }

    const edgeWidth = Math.max(
      1,
      Math.floor(canvasElement.width * EDGE_ANALYSIS_SCALE),
    );
    const edgeHeight = Math.max(
      1,
      Math.floor(canvasElement.height * EDGE_ANALYSIS_SCALE),
    );

    if (
      edgeCanvas.width !== edgeWidth ||
      edgeCanvas.height !== edgeHeight
    ) {
      edgeCanvas.width = edgeWidth;
      edgeCanvas.height = edgeHeight;
      edgeOutputImageData = edgeContext.createImageData(edgeWidth, edgeHeight);
    }

    edgeContext.imageSmoothingEnabled = false;
    edgeContext.clearRect(0, 0, edgeWidth, edgeHeight);

    // Draw the video matching the screen's crop, scaled by our analysis scale
    edgeContext.drawImage(
      videoElement,
      displayRect.x * EDGE_ANALYSIS_SCALE,
      displayRect.y * EDGE_ANALYSIS_SCALE,
      displayRect.width * EDGE_ANALYSIS_SCALE,
      displayRect.height * EDGE_ANALYSIS_SCALE,
    );

    const imageData = edgeContext.getImageData(
      0,
      0,
      edgeWidth,
      edgeHeight,
    );
    const source = imageData.data;
    const output =
      edgeOutputImageData ?? edgeContext.createImageData(edgeWidth, edgeHeight);
    const destination = output.data;

    // Clear destination
    for (let i = 0; i < destination.length; i += 4) {
      destination[i] = 0;
      destination[i + 1] = 0;
      destination[i + 2] = 0;
      destination[i + 3] = 0;
    }

    const w = edgeWidth;
    const h = edgeHeight;

    // Sobel kernels
    const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    // Helper to get pixel intensity (grayscale)
    const getIntensity = (x: number, y: number) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return 0;
      const offset = (y * w + x) * 4;
      // Fast luminance
      return (source[offset] * 0.299 + source[offset + 1] * 0.587 + source[offset + 2] * 0.114);
    };

    // Apply Kernel (skip outmost border pixels for speed/safety)
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
        destination[offset] = 255;     // R
        destination[offset + 1] = 255;   // G
        destination[offset + 2] = 255;   // B
        destination[offset + 3] = val;   // Alpha (255 if edge, 0 if not)
      }
    }

    edgeOutputImageData = output;
    edgeContext.putImageData(output, 0, 0);
  };

  const drawSobelOverlay = () => {
    if (!edgeCanvas) {
      return;
    }

    const previousSmoothing = context.imageSmoothingEnabled;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      edgeCanvas,
      0,
      0,
      canvasElement.width,
      canvasElement.height,
    );
    context.imageSmoothingEnabled = previousSmoothing;
  };

  let thermalCanvas: HTMLCanvasElement | null = null;
  let thermalContext: CanvasRenderingContext2D | null = null;

  const processThermalFilter = (analysisFrame: AnalysisFrame) => {
    if (!thermalCanvas || !thermalContext) {
      thermalCanvas = document.createElement("canvas");
      thermalContext = thermalCanvas.getContext("2d", {
        willReadFrequently: true,
      });
    }

    if (!thermalCanvas || !thermalContext) {
      return;
    }

    const processWidth = Math.max(1, Math.round(analysisFrame.width * EDGE_ANALYSIS_SCALE));
    const processHeight = Math.max(1, Math.round(analysisFrame.height * EDGE_ANALYSIS_SCALE));

    if (thermalCanvas.width !== processWidth || thermalCanvas.height !== processHeight) {
      thermalCanvas.width = processWidth;
      thermalCanvas.height = processHeight;
    }

    thermalContext.drawImage(analysisFrame.canvas, 0, 0, processWidth, processHeight);

    const imgData = thermalContext.getImageData(0, 0, processWidth, processHeight);
    const src = imgData.data;
    const output = new ImageData(processWidth, processHeight);
    const dst = output.data;

    // Apply color gradient based on luminance
    for (let i = 0; i < src.length; i += 4) {
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const alpha = src[i + 3];

      const luminance = r * 0.299 + g * 0.587 + b * 0.114;
      const normalizedLum = luminance / 255;

      let outR = 0, outG = 0, outB = 0;

      if (normalizedLum < 0.33) {
        const t = normalizedLum / 0.33;
        outR = 0;
        outG = 0;
        outB = Math.round(t * 255);
      } else if (normalizedLum < 0.66) {
        const t = (normalizedLum - 0.33) / 0.33;
        outR = Math.round(t * 255);
        outG = Math.round(t * 255);
        outB = Math.round((1 - t) * 255);
      } else {
        const t = (normalizedLum - 0.66) / 0.34;
        outR = 255;
        outG = Math.round((1 - t) * 255);
        outB = Math.round((1 - t) * 255);
      }

      dst[i] = outR;
      dst[i + 1] = outG;
      dst[i + 2] = outB;
      dst[i + 3] = alpha;
    }

    thermalContext.putImageData(output, 0, 0);
  };

  const drawThermalOverlay = (displayRect: VideoDisplayRect) => {
    if (!thermalCanvas) {
      return;
    }

    const previousSmoothing = context.imageSmoothingEnabled;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      thermalCanvas,
      displayRect.x,
      displayRect.y,
      displayRect.width,
      displayRect.height,
    );
    context.imageSmoothingEnabled = previousSmoothing;
  };

  const startDetectionModel = async () => {
    if (!DETECTION_ENABLED_BY_DEFAULT) {
      onModelStatusChange?.("AI: STANDBY");
      return;
    }

    try {
      onModelStatusChange?.("AI: LOADING");
      await getDetectionModel();

      if (isStopped) {
        return;
      }

      detectionReady = true;
      onModelStatusChange?.("AI: READY");
    } catch (error) {
      detectionFailed = true;
      onModelStatusChange?.("AI: FAILED");
      console.error("Failed to load the FireSight detection model.", error);
    }
  };

  const detectFrame = (analysisFrame: AnalysisFrame) => {
    if (
      !DETECTION_ENABLED_BY_DEFAULT ||
      !detectionReady ||
      detectionFailed ||
      detectionInFlight
    ) {
      return;
    }

    if (!detectionCanvas || !detectionContext) {
      detectionCanvas = document.createElement("canvas");
      detectionContext = detectionCanvas.getContext("2d");
    }

    if (!detectionCanvas || !detectionContext) {
      return;
    }

    if (
      detectionCanvas.width !== analysisFrame.width ||
      detectionCanvas.height !== analysisFrame.height
    ) {
      detectionCanvas.width = analysisFrame.width;
      detectionCanvas.height = analysisFrame.height;
    }

    detectionContext.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);
    detectionContext.drawImage(analysisFrame.canvas, 0, 0);

    detectionInFlight = true;
    const detectionInput = detectionCanvas;
    const scaleX = analysisFrame.scaleX;
    const scaleY = analysisFrame.scaleY;

    void getDetectionModel()
      .then((model) => model.detect(detectionInput))
      .then((predictions) => {
        if (isStopped) {
          return;
        }

        lastPredictions = predictions
          .filter((prediction) => DETECTION_CLASSES.has(prediction.class))
          .map((prediction) =>
            scalePredictionToSource(prediction, scaleX, scaleY),
          );
      })
      .catch((error) => {
        if (isStopped) {
          return;
        }

        detectionFailed = true;
        onModelStatusChange?.("AI: FAILED");
        console.error("Failed to run FireSight object detection.", error);
      })
      .finally(() => {
        detectionInFlight = false;
      });
  };

  const maybeDegradePerformanceBudget = (now: number) => {
    fpsWindowFrameCount += 1;

    if (now - fpsWindowStartedAt < PERFORMANCE_WINDOW_MS) {
      return;
    }

    const overlayFps =
      (fpsWindowFrameCount * 1000) / (now - fpsWindowStartedAt);

    if (overlayFps < LOW_FPS_THRESHOLD) {
      const change = degradePerformanceBudget(
        performanceBudget,
        performanceStepIndices,
      );

      if (change) {
        console.warn(
          "Degrading the FireSight analysis budget to protect publisher framerate.",
          {
            change,
            overlayFps: Math.round(overlayFps),
          },
        );
      }
    }

    fpsWindowFrameCount = 0;
    fpsWindowStartedAt = now;
  };

  const renderLoop = (now: number) => {
    if (isStopped) {
      return;
    }

    maybeDegradePerformanceBudget(now);
    context.clearRect(0, 0, canvasElement.width, canvasElement.height);

    const displayRect =
      videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ? getVideoDisplayRect(canvasElement, videoElement)
        : null;

    if (displayRect) {
      const shouldProcessEdge =
        now - lastEdgeProcessedAt >= 1000 / performanceBudget.edgeFps;
      const shouldDetect =
        DETECTION_ENABLED_BY_DEFAULT &&
        now - lastDetectionAt >= 1000 / performanceBudget.detectionFps;
      let analysisFrame: AnalysisFrame | null = null;

      if (shouldProcessEdge || shouldDetect) {
        analysisFrame = ensureAnalysisFrame();
      }

      if (currentViewMode === ViewMode.CONTOUR) {
        if (shouldProcessEdge) {
          processSobelFilter(displayRect);
          lastEdgeProcessedAt = now;
        }
      } else if (currentViewMode === ViewMode.THERMAL) {
        if (shouldProcessEdge && analysisFrame) {
          processThermalFilter(analysisFrame);
          lastEdgeProcessedAt = now;
        }
      }

      if (shouldDetect && analysisFrame) {
        detectFrame(analysisFrame);
        lastDetectionAt = now;
      }

      if (currentViewMode === ViewMode.CONTOUR) {
        applySmokeEffect(context, canvasElement);
        drawSobelOverlay();
      } else if (currentViewMode === ViewMode.THERMAL) {
        drawThermalOverlay(displayRect);
      }
      drawBoundingBoxes(
        context,
        lastPredictions.map((prediction) =>
          scalePrediction(
            prediction,
            displayRect.x,
            displayRect.y,
            displayRect.scale,
          ),
        ),
      );
    }

    drawReticle(context, canvasElement);

    animationFrameId = window.requestAnimationFrame(renderLoop);
  };

  ensureCanvasSize(canvasElement);
  onSystemStatusChange?.("SYS: ONLINE");
  window.addEventListener("resize", handleResize);

  if (supportsVideoFrameCallback) {
    scheduleNextVideoFrame();
  }

  void startDetectionModel();
  animationFrameId = window.requestAnimationFrame(renderLoop);

  return { stop, setViewMode };
}
