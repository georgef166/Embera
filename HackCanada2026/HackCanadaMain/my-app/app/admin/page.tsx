"use client";

import { useEffect, useRef, useState } from "react";
import { ObjectDetectionOverlay } from "@/components/object-detection-overlay";
import { WatchTelemetryOverlay } from "@/components/watch-telemetry-overlay";
import type { CocoPrediction } from "@/lib/coco-detections";
import { mapPredictionsToDetections } from "@/lib/coco-detections";
import { useTelemetry } from "@/lib/use-telemetry";
import type { Detection } from "@/lib/types";
import {
  type CameraSummary,
  PEER_CONFIGURATION,
  type ViewerReadyPayload,
  listCameras,
  pollSignals,
  preferVideoCodec,
  sendSignal,
  waitForIceGatheringComplete,
} from "@/lib/webrtc-signaling";

const ADMIN_SELECTED_CAMERA_STORAGE_KEY = "hud-admin-selected-camera-id";
const CAMERA_POLL_INTERVAL_MS = 2_000;
const DEFAULT_AUDIO_STATUS = "Tap to enable audio";
const DEFAULT_ML_STATUS = "ML overlay off";
const RECONNECT_DELAY_MS = 1_000;
const REQUEST_THROTTLE_MS = 1_500;
const H264_VIDEO_MIME_TYPE = "video/H264";
const ADMIN_VIEWER_READY_PAYLOAD: ViewerReadyPayload = {
  preferAudio: true,
  ready: true,
  viewerProfile: "admin-low",
};

interface DetectionModel {
  detect(input: HTMLVideoElement): Promise<CocoPrediction[]>;
}

interface PendingCameraRequest {
  at: number;
  clientId: string;
}

function getFallbackCameraLabel(clientId: string) {
  return `Camera ${clientId.slice(0, 4).toUpperCase()}`;
}

function formatLastSeen(lastSeenAt: string) {
  const ageInSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 1000),
  );

  if (ageInSeconds <= 1) {
    return "Live now";
  }

  if (ageInSeconds < 60) {
    return `${ageInSeconds}s ago`;
  }

  return `${Math.floor(ageInSeconds / 60)}m ago`;
}

export default function AdminPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const detectionModelRef = useRef<DetectionModel | null>(null);
  const cameraNameMapRef = useRef<Record<string, string>>({});
  const closePeerConnectionRef = useRef<() => void>(() => { });
  const requestCameraRef = useRef<
    (clientId: string, force?: boolean) => Promise<void>
  >(async () => { });
  const selectedClientIdRef = useRef<string | null>(null);
  const selectionHydratedRef = useRef(false);
  const lastCameraRequestRef = useRef<PendingCameraRequest | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [cameras, setCameras] = useState<CameraSummary[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [hasStream, setHasStream] = useState(false);
  const [mlEnabled, setMlEnabled] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [status, setStatus] = useState("Waiting for cameras to connect...");
  const [audioStatus, setAudioStatus] = useState(DEFAULT_AUDIO_STATUS);
  const [mlStatus, setMlStatus] = useState(DEFAULT_ML_STATUS);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Link HUD to the simulated backend watch session instead of the WebRTC dynamic Session ID
  const telemetry = useTelemetry("demo-session");

  useEffect(() => {
    if (typeof window === "undefined") {
      selectionHydratedRef.current = true;
      return;
    }

    const savedClientId = window.localStorage.getItem(
      ADMIN_SELECTED_CAMERA_STORAGE_KEY,
    );

    if (savedClientId) {
      selectedClientIdRef.current = savedClientId;
      setSelectedClientId(savedClientId);
    }

    selectionHydratedRef.current = true;
  }, []);

  useEffect(() => {
    selectedClientIdRef.current = selectedClientId;

    if (!selectionHydratedRef.current || typeof window === "undefined") {
      return;
    }

    if (selectedClientId) {
      window.localStorage.setItem(
        ADMIN_SELECTED_CAMERA_STORAGE_KEY,
        selectedClientId,
      );
      return;
    }

    window.localStorage.removeItem(ADMIN_SELECTED_CAMERA_STORAGE_KEY);
  }, [selectedClientId]);

  useEffect(() => {
    cameraNameMapRef.current = Object.fromEntries(
      cameras.map((camera) => [camera.clientId, camera.displayName]),
    );
  }, [cameras]);

  useEffect(() => {
    const abortController = new AbortController();
    let cameraPollTimeoutId = 0;
    let offerPollTimeoutId = 0;
    let reconnectTimeoutId = 0;
    let isDisposed = false;
    let lastMessageId = 0;

    const getCameraLabel = (clientId: string) =>
      cameraNameMapRef.current[clientId] ?? getFallbackCameraLabel(clientId);

    const resetViewerState = (nextStatus: string) => {
      setAudioEnabled(false);
      setAudioStatus(DEFAULT_AUDIO_STATUS);
      setDetections([]);
      setHasAudioTrack(false);
      setHasStream(false);
      setStatus(nextStatus);
    };

    const closePeerConnection = () => {
      window.clearTimeout(reconnectTimeoutId);
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      activeSessionIdRef.current = null;
      setCurrentSessionId(null);

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    closePeerConnectionRef.current = closePeerConnection;

    const requestCamera = async (clientId: string, force = false) => {
      if (!clientId || isDisposed) {
        return;
      }

      const lastRequest = lastCameraRequestRef.current;

      if (
        !force &&
        lastRequest?.clientId === clientId &&
        Date.now() - lastRequest.at < REQUEST_THROTTLE_MS
      ) {
        return;
      }

      lastCameraRequestRef.current = {
        at: Date.now(),
        clientId,
      };

      closePeerConnection();
      resetViewerState(`Waiting for ${getCameraLabel(clientId)}...`);

      try {
        await sendSignal("publisher", {
          clientId,
          sessionId: crypto.randomUUID(),
          type: "viewer-ready",
          payload: ADMIN_VIEWER_READY_PAYLOAD,
        });
      } catch (error) {
        console.error("Failed to request a camera stream.", error);
        setStatus(`Failed to request ${getCameraLabel(clientId)}.`);
      }
    };

    requestCameraRef.current = requestCamera;

    const connectOffer = async (
      offer: RTCSessionDescriptionInit,
      sessionId: string,
      clientId: string,
    ) => {
      if (selectedClientIdRef.current !== clientId || isDisposed) {
        return;
      }

      closePeerConnection();
      activeSessionIdRef.current = sessionId;
      setCurrentSessionId(sessionId);
      setAudioEnabled(false);
      setAudioStatus(DEFAULT_AUDIO_STATUS);
      setDetections([]);
      setHasAudioTrack(false);
      setHasStream(false);
      setStatus(`Connecting to ${getCameraLabel(clientId)}...`);

      const peerConnection = new RTCPeerConnection(PEER_CONFIGURATION);
      peerConnectionRef.current = peerConnection;

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;

        if (!remoteStream || !videoRef.current) {
          return;
        }

        videoRef.current.srcObject = remoteStream;
        setHasAudioTrack(remoteStream.getAudioTracks().length > 0);
        setHasStream(remoteStream.getVideoTracks().length > 0);
        void videoRef.current.play().catch(() => {
          // Autoplay can be blocked until the browser considers the page active.
        });
      };

      peerConnection.onconnectionstatechange = () => {
        switch (peerConnection.connectionState) {
          case "connected":
            setStatus(`Live: ${getCameraLabel(clientId)}`);
            break;
          case "connecting":
            setStatus(`Connecting to ${getCameraLabel(clientId)}...`);
            break;
          case "failed":
          case "disconnected":
            if (selectedClientIdRef.current !== clientId) {
              break;
            }

            activeSessionIdRef.current = null;
            setAudioEnabled(false);
            setAudioStatus(DEFAULT_AUDIO_STATUS);
            setDetections([]);
            setHasAudioTrack(false);
            setHasStream(false);
            setStatus(`Waiting for ${getCameraLabel(clientId)} to reconnect...`);
            window.clearTimeout(reconnectTimeoutId);
            reconnectTimeoutId = window.setTimeout(() => {
              if (!isDisposed && selectedClientIdRef.current === clientId) {
                void requestCamera(clientId, true);
              }
            }, RECONNECT_DELAY_MS);
            break;
          default:
            break;
        }
      };

      try {
        await peerConnection.setRemoteDescription(offer);

        if (!preferVideoCodec(peerConnection, H264_VIDEO_MIME_TYPE)) {
          console.warn(
            "H.264 was unavailable for the admin answer. Continuing with the browser default codec.",
          );
        }

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await waitForIceGatheringComplete(peerConnection);

        if (!peerConnection.localDescription) {
          throw new Error("Missing local answer after ICE gathering.");
        }

        await sendSignal("publisher", {
          clientId,
          sessionId,
          type: "answer",
          payload: peerConnection.localDescription.toJSON(),
        });
      } catch (error) {
        console.error("Failed to connect to the requested camera.", error);

        if (peerConnectionRef.current === peerConnection) {
          closePeerConnection();
        }

        if (selectedClientIdRef.current === clientId) {
          setStatus(`Failed to connect to ${getCameraLabel(clientId)}.`);
        }
      }
    };

    const pollForOffers = async () => {
      if (isDisposed) {
        return;
      }

      try {
        const messages = await pollSignals("viewer", lastMessageId, {
          signal: abortController.signal,
        });

        for (const message of messages) {
          lastMessageId = Math.max(lastMessageId, message.id);

          if (
            message.type !== "offer" ||
            message.clientId !== selectedClientIdRef.current ||
            message.sessionId === activeSessionIdRef.current
          ) {
            continue;
          }

          await connectOffer(
            message.payload as RTCSessionDescriptionInit,
            message.sessionId,
            message.clientId,
          );
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Failed to receive the camera offer.", error);
          setStatus("Waiting for camera offers...");
        }
      } finally {
        if (!isDisposed) {
          offerPollTimeoutId = window.setTimeout(pollForOffers, 1000);
        }
      }
    };

    const pollCameraList = async () => {
      if (isDisposed) {
        return;
      }

      try {
        const nextCameras = await listCameras(abortController.signal);

        if (isDisposed) {
          return;
        }

        setCameras(nextCameras);
        const fallbackCamera = nextCameras[0] ?? null;

        if (!selectedClientIdRef.current) {
          if (fallbackCamera) {
            selectedClientIdRef.current = fallbackCamera.clientId;
            setStatus(`Waiting for ${fallbackCamera.displayName}...`);
            setSelectedClientId(fallbackCamera.clientId);
            return;
          }

          setStatus((current) =>
            current.startsWith("Live:")
              ? current
              : "Waiting for cameras to connect...",
          );
          return;
        }

        const selectedCameraStillOnline = nextCameras.some(
          (camera) => camera.clientId === selectedClientIdRef.current,
        );

        if (!selectedCameraStillOnline && fallbackCamera) {
          selectedClientIdRef.current = fallbackCamera.clientId;
          setStatus(`Waiting for ${fallbackCamera.displayName}...`);
          setSelectedClientId(fallbackCamera.clientId);
          return;
        }

        if (!selectedCameraStillOnline && activeSessionIdRef.current === null) {
          setStatus(
            `Waiting for ${getCameraLabel(selectedClientIdRef.current)} to reconnect...`,
          );
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Failed to refresh the camera list.", error);
        }
      } finally {
        if (!isDisposed) {
          cameraPollTimeoutId = window.setTimeout(
            pollCameraList,
            CAMERA_POLL_INTERVAL_MS,
          );
        }
      }
    };

    void pollForOffers();
    void pollCameraList();

    return () => {
      isDisposed = true;
      abortController.abort();
      window.clearTimeout(cameraPollTimeoutId);
      window.clearTimeout(offerPollTimeoutId);
      window.clearTimeout(reconnectTimeoutId);
      closePeerConnection();
      requestCameraRef.current = async () => { };
      closePeerConnectionRef.current = () => { };
    };
  }, []);

  useEffect(() => {
    if (!selectionHydratedRef.current) {
      return;
    }

    if (!selectedClientId) {
      closePeerConnectionRef.current();
      setAudioEnabled(false);
      setAudioStatus(DEFAULT_AUDIO_STATUS);
      setDetections([]);
      setHasAudioTrack(false);
      setHasStream(false);
      setStatus("Select a camera to view.");
      return;
    }

    void requestCameraRef.current(selectedClientId, true);
  }, [selectedClientId]);

  useEffect(() => {
    if (!mlEnabled) {
      setDetections([]);
      setMlStatus(DEFAULT_ML_STATUS);
      return;
    }

    if (!hasStream) {
      setDetections([]);
      setMlStatus("Waiting for live video...");
      return;
    }

    let cancelled = false;
    let animationFrameId = 0;
    let isDetecting = false;

    const loadModel = async () => {
      if (detectionModelRef.current) {
        return detectionModelRef.current;
      }

      setMlStatus("Loading ML model...");
      await Promise.all([
        import("@tensorflow/tfjs-backend-cpu"),
        import("@tensorflow/tfjs-backend-webgl"),
      ]);
      const cocoSsd = await import("@tensorflow-models/coco-ssd");

      if (cancelled) {
        return null;
      }

      detectionModelRef.current = await cocoSsd.load({
        base: "mobilenet_v2",
      });

      return detectionModelRef.current;
    };

    const startDetection = async () => {
      try {
        const model = await loadModel();

        if (!model || cancelled) {
          return;
        }

        setMlStatus("Analyzing selected feed...");

        const detectFrame = () => {
          if (cancelled) {
            return;
          }

          const videoElement = videoRef.current;

          if (
            !videoElement ||
            videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            videoElement.videoWidth === 0 ||
            videoElement.videoHeight === 0
          ) {
            animationFrameId = window.requestAnimationFrame(detectFrame);
            return;
          }

          if (isDetecting) {
            animationFrameId = window.requestAnimationFrame(detectFrame);
            return;
          }

          isDetecting = true;

          void model
            .detect(videoElement)
            .then((predictions) => {
              if (cancelled) {
                return;
              }

              setDetections(
                mapPredictionsToDetections(
                  predictions,
                  videoElement.videoWidth,
                  videoElement.videoHeight,
                ),
              );
            })
            .catch((error) => {
              console.error("Failed to run ML detection on the admin feed.", error);
              setMlStatus("ML overlay unavailable");
            })
            .finally(() => {
              isDetecting = false;

              if (!cancelled) {
                animationFrameId = window.requestAnimationFrame(detectFrame);
              }
            });
        };

        detectFrame();
      } catch (error) {
        console.error("Failed to load the ML model on admin.", error);
        setMlStatus("ML overlay unavailable");
      }
    };

    void startDetection();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [hasStream, mlEnabled]);

  const handleEnableAudio = async () => {
    const videoElement = videoRef.current;

    if (!videoElement || !hasAudioTrack) {
      return;
    }

    try {
      videoElement.muted = false;
      videoElement.volume = 1;
      await videoElement.play();
      setAudioEnabled(true);
      setAudioStatus("Audio enabled");
    } catch (error) {
      videoElement.muted = true;
      setAudioEnabled(false);
      setAudioStatus("Audio playback was blocked. Tap again.");
      console.error("Failed to enable remote audio playback.", error);
    }
  };

  const handleSelectCamera = (camera: CameraSummary) => {
    cameraNameMapRef.current[camera.clientId] = camera.displayName;

    if (camera.clientId === selectedClientId) {
      void requestCameraRef.current(camera.clientId, true);
      return;
    }

    selectedClientIdRef.current = camera.clientId;
    setSelectedClientId(camera.clientId);
  };

  const selectedCamera = selectedClientId
    ? cameras.find((camera) => camera.clientId === selectedClientId) ?? null
    : null;

  return (
    <main className="relative h-svh w-full overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        className="h-full w-full bg-black object-contain"
        muted={!audioEnabled}
        playsInline
      />
      {mlEnabled && detections.length > 0 ? (
        <ObjectDetectionOverlay detections={detections} />
      ) : null}

      {hasStream ? (
        <WatchTelemetryOverlay telemetry={telemetry} />
      ) : null}

      <div className="absolute inset-x-0 top-0 z-50 space-y-3 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-2xl bg-black/65 px-4 py-3 backdrop-blur">
            <p className="text-sm text-white/85">{status}</p>
            {selectedCamera ? (
              <p className="mt-1 text-xs text-white/60">
                Viewing {selectedCamera.displayName}
              </p>
            ) : null}
            {hasAudioTrack ? (
              <p className="mt-1 text-xs text-white/60">{audioStatus}</p>
            ) : null}
            <p className="mt-1 text-xs text-white/60">{mlStatus}</p>
          </div>
          <button
            type="button"
            onClick={() => setMlEnabled((current) => !current)}
            className="rounded-full border border-white/20 bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur"
          >
            {mlEnabled ? "Hide ML overlay" : "Show ML overlay"}
          </button>
        </div>
        <div className="rounded-2xl  px-3 py-3">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-white/45">
            <span>Connected Cameras</span>
            <span>{cameras.length} online</span>
          </div>
          <div>
            {cameras.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {cameras.map((camera) => {
                  const isSelected = camera.clientId === selectedClientId;

                  return (
                    <button
                      key={camera.clientId}
                      type="button"
                      onClick={() => handleSelectCamera(camera)}
                      className={`min-w-52 rounded-2xl border px-4 py-3 text-left transition ${isSelected
                        ? "border-cyan-300 bg-cyan-500/15 text-white"
                        : "border-white/10 bg-white/5 text-white/80"
                        }`}
                    >
                      <p className="text-sm font-semibold">{camera.displayName}</p>
                      <p className="mt-1 text-xs text-white/45">
                        {camera.clientId.slice(0, 8)}
                      </p>
                      <p className="mt-2 text-xs text-white/60">
                        {isSelected ? "Selected" : formatLastSeen(camera.lastSeenAt)}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-white/60">No cameras connected yet.</p>
            )}
          </div>
        </div>
      </div>
      {!selectedClientId && cameras.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
          <div className="rounded-2xl bg-black/60 px-5 py-4 text-center text-sm text-white/75 backdrop-blur">
            Waiting for cameras to connect.
          </div>
        </div>
      ) : null}
      {hasStream && hasAudioTrack && !audioEnabled ? (
        <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
          <button
            type="button"
            onClick={handleEnableAudio}
            className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black shadow-lg"
          >
            Enable audio
          </button>
        </div>
      ) : null}
    </main>
  );
}
