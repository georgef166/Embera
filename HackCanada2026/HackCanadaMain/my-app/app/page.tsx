"use client";

import { useEffect, useRef, useState } from "react";
import { FireSightView } from "@/components/firesight-view";
import { startFireSightPublisherUi } from "@/lib/firesight-publisher-ui";
import {
  PEER_CONFIGURATION,
  type ViewerProfile,
  type ViewerReadyPayload,
  preferVideoCodec,
  pollSignals,
  sendSignal,
  sendUnregisterCameraBeacon,
  unregisterCamera,
  upsertCameraPresence,
  waitForIceGatheringComplete,
} from "@/lib/webrtc-signaling";

const CAMERA_CLIENT_ID_STORAGE_KEY = "hud-camera-client-id";
const CAMERA_DISPLAY_NAME_STORAGE_KEY = "hud-camera-display-name";
const CAMERA_HEARTBEAT_INTERVAL_MS = 10_000;
const DEFAULT_MODEL_STATUS = "AI: STANDBY";
const DEFAULT_SYSTEM_STATUS = "SYS: BOOTING";
const H264_VIDEO_MIME_TYPE = "video/H264";
const PUBLISHER_CAPTURE_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: {
    ideal: "environment",
  },
  frameRate: {
    ideal: 30,
    max: 30,
  },
  height: {
    ideal: 1080,
    max: 1080,
  },
  width: {
    ideal: 1920,
    max: 1920,
  },
};
const FALLBACK_CAPTURE_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  frameRate: {
    ideal: 30,
    max: 30,
  },
  height: {
    ideal: 1080,
    max: 1080,
  },
  width: {
    ideal: 1920,
    max: 1920,
  },
};
const ADMIN_LOW_VIDEO_ENCODING: Pick<
  RTCRtpEncodingParameters,
  "maxBitrate" | "maxFramerate" | "scaleResolutionDownBy"
> = {
  maxBitrate: 250_000,
  maxFramerate: 10,
  scaleResolutionDownBy: 2.25,
};

type ViewerStreamPreferences = {
  preferAudio: boolean;
  viewerProfile: ViewerProfile;
};

const DEFAULT_VIEWER_STREAM_PREFERENCES: ViewerStreamPreferences = {
  preferAudio: true,
  viewerProfile: "default",
};

async function getPublisherCameraStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: PUBLISHER_CAPTURE_VIDEO_CONSTRAINTS,
    });
  } catch (preferredCameraError) {
    console.warn(
      "Environment camera was unavailable for the publisher. Falling back to the default camera.",
      preferredCameraError,
    );

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: FALLBACK_CAPTURE_VIDEO_CONSTRAINTS,
      });
    } catch (fallbackCameraError) {
      console.error(
        "Failed to acquire any camera for the publisher.",
        {
          fallbackCameraError,
          preferredCameraError,
        },
      );

      throw fallbackCameraError;
    }
  }
}

function getDefaultCameraName(clientId: string) {
  return `Camera ${clientId.slice(0, 4).toUpperCase()}`;
}

function getViewerStreamPreferences(payload: unknown): ViewerStreamPreferences {
  if (!payload || typeof payload !== "object") {
    return DEFAULT_VIEWER_STREAM_PREFERENCES;
  }

  const candidate = payload as Partial<ViewerReadyPayload>;

  return {
    preferAudio: candidate.preferAudio !== false,
    viewerProfile:
      candidate.viewerProfile === "admin-low" ? "admin-low" : "default",
  };
}

async function applyVideoSenderProfile(
  sender: RTCRtpSender | null,
  viewerProfile: ViewerProfile,
) {
  if (!sender || sender.track?.kind !== "video" || viewerProfile !== "admin-low") {
    return;
  }

  const parameters = sender.getParameters();
  const encodings =
    parameters.encodings && parameters.encodings.length > 0
      ? parameters.encodings
      : ([{}] as RTCRtpEncodingParameters[]);

  parameters.encodings = encodings.map((encoding, index) =>
    index === 0 ? { ...encoding, ...ADMIN_LOW_VIDEO_ENCODING } : encoding,
  );

  try {
    await sender.setParameters(parameters);
  } catch (error) {
    console.warn("Failed to apply the admin-low video profile.", error);
  }
}

function getOrCreatePublisherIdentity() {
  const existingClientId = window.localStorage.getItem(
    CAMERA_CLIENT_ID_STORAGE_KEY,
  );
  const clientId = existingClientId || crypto.randomUUID();

  if (!existingClientId) {
    window.localStorage.setItem(CAMERA_CLIENT_ID_STORAGE_KEY, clientId);
  }

  const urlName = new URLSearchParams(window.location.search).get("name")?.trim();

  if (urlName) {
    window.localStorage.setItem(CAMERA_DISPLAY_NAME_STORAGE_KEY, urlName);

    return {
      clientId,
      displayName: urlName,
    };
  }

  const existingDisplayName = window.localStorage.getItem(
    CAMERA_DISPLAY_NAME_STORAGE_KEY,
  )?.trim();

  if (existingDisplayName) {
    return {
      clientId,
      displayName: existingDisplayName,
    };
  }

  const fallbackName = getDefaultCameraName(clientId);
  const promptedName =
    window.prompt("Name this camera for the admin view.", fallbackName)?.trim() ||
    fallbackName;

  window.localStorage.setItem(CAMERA_DISPLAY_NAME_STORAGE_KEY, promptedName);

  return {
    clientId,
    displayName: promptedName,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [modelStatus, setModelStatus] = useState(DEFAULT_MODEL_STATUS);
  const [systemStatus, setSystemStatus] = useState(DEFAULT_SYSTEM_STATUS);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setSystemStatus("SYS: HTTPS REQ");
      setModelStatus(DEFAULT_MODEL_STATUS);
      console.error(
        "Camera and microphone access requires a secure context such as localhost or a Tailscale HTTPS URL.",
      );
      return;
    }

    const abortController = new AbortController();
    const { clientId, displayName } = getOrCreatePublisherIdentity();
    let heartbeatIntervalId = 0;
    let cameraStream: MediaStream | null = null;
    let microphoneStream: MediaStream | null = null;
    let peerConnection: RTCPeerConnection | null = null;
    let currentSessionId: string | null = null;
    let isDisposed = false;
    let isNegotiating = false;
    let lastMessageId = 0;
    let pollTimeoutId = 0;
    let shouldRepublish = false;
    let stopFireSightUi = () => {};
    let currentViewerPreferences = DEFAULT_VIEWER_STREAM_PREFERENCES;

    const closePeerConnection = () => {
      peerConnection?.close();
      peerConnection = null;
      currentSessionId = null;
    };

    const updatePresence = async () => {
      await upsertCameraPresence(
        {
          clientId,
          displayName,
        },
        abortController.signal,
      );
    };

    const publishOffer = async () => {
      if (isDisposed || !cameraStream) {
        return;
      }

      if (isNegotiating) {
        shouldRepublish = true;
        return;
      }

      isNegotiating = true;
      shouldRepublish = false;

      closePeerConnection();

      const nextPeerConnection = new RTCPeerConnection(PEER_CONFIGURATION);
      const nextSessionId = crypto.randomUUID();

      peerConnection = nextPeerConnection;
      currentSessionId = nextSessionId;

      try {
        const viewerPreferences = currentViewerPreferences;
        let videoSender: RTCRtpSender | null = null;

        for (const track of cameraStream.getTracks()) {
          const sender = nextPeerConnection.addTrack(track, cameraStream);

          if (!videoSender && track.kind === "video") {
            videoSender = sender;
          }
        }

        await applyVideoSenderProfile(videoSender, viewerPreferences.viewerProfile);

        if (!preferVideoCodec(nextPeerConnection, H264_VIDEO_MIME_TYPE)) {
          console.warn(
            "H.264 was unavailable for the publisher offer. Continuing with the browser default codec.",
          );
        }

        if (microphoneStream && viewerPreferences.preferAudio) {
          for (const track of microphoneStream.getAudioTracks()) {
            nextPeerConnection.addTrack(track, microphoneStream);
          }
        }

        const offer = await nextPeerConnection.createOffer();
        await nextPeerConnection.setLocalDescription(offer);
        await waitForIceGatheringComplete(nextPeerConnection);

        if (!nextPeerConnection.localDescription) {
          throw new Error("Missing local offer after ICE gathering.");
        }

        await sendSignal("viewer", {
          clientId,
          sessionId: nextSessionId,
          type: "offer",
          payload: nextPeerConnection.localDescription.toJSON(),
        });
      } catch (error) {
        console.error("Failed to publish a fresh camera offer.", error);

        if (peerConnection === nextPeerConnection) {
          closePeerConnection();
        }
      } finally {
        isNegotiating = false;

        if (shouldRepublish && !isDisposed) {
          shouldRepublish = false;
          void publishOffer();
        }
      }
    };

    const pollForSignals = async () => {
      if (isDisposed) {
        return;
      }

      try {
        const messages = await pollSignals("publisher", lastMessageId, {
          clientId,
          signal: abortController.signal,
        });

        for (const message of messages) {
          lastMessageId = Math.max(lastMessageId, message.id);

          if (message.type === "viewer-ready") {
            currentViewerPreferences = getViewerStreamPreferences(message.payload);
            void publishOffer();
            continue;
          }

          if (message.type !== "answer") {
            continue;
          }

          if (
            message.sessionId !== currentSessionId ||
            !peerConnection ||
            peerConnection.remoteDescription
          ) {
            continue;
          }

          await peerConnection.setRemoteDescription(
            message.payload as RTCSessionDescriptionInit,
          );
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Failed to receive publisher signals.", error);
        }
      } finally {
        if (!isDisposed) {
          pollTimeoutId = window.setTimeout(pollForSignals, 1000);
        }
      }
    };

    const startPublisher = async () => {
      setSystemStatus(DEFAULT_SYSTEM_STATUS);
      setModelStatus("AI: LOADING");

      try {
        cameraStream = await getPublisherCameraStream();

        if (isDisposed) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current && canvasRef.current) {
          try {
            stopFireSightUi = await startFireSightPublisherUi({
              canvasElement: canvasRef.current,
              onModelStatusChange: setModelStatus,
              onSystemStatusChange: setSystemStatus,
              stream: cameraStream,
              videoElement: videoRef.current,
            });
          } catch (error) {
            setSystemStatus("SYS: HUD FAIL");
            setModelStatus("AI: FAILED");
            console.error("Failed to start the FireSight publisher view.", error);
          }
        } else {
          setSystemStatus("SYS: DISPLAY ERR");
        }

        try {
          microphoneStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              autoGainControl: true,
              echoCancellation: true,
              noiseSuppression: true,
            },
            video: false,
          });
        } catch (error) {
          console.warn(
            "Microphone access was unavailable. Continuing with video only.",
            error,
          );
        }

        if (isDisposed) {
          cameraStream.getTracks().forEach((track) => track.stop());
          microphoneStream?.getTracks().forEach((track) => track.stop());
          return;
        }

        await updatePresence();
        heartbeatIntervalId = window.setInterval(() => {
          void upsertCameraPresence({
            clientId,
            displayName,
          }).catch((error) => {
            console.error("Failed to refresh camera presence.", error);
          });
        }, CAMERA_HEARTBEAT_INTERVAL_MS);

        void pollForSignals();
      } catch (error) {
        setSystemStatus("SYS: CAMERA FAIL");
        setModelStatus(DEFAULT_MODEL_STATUS);
        console.error("Failed to start the camera publisher.", error);
      }
    };

    void startPublisher();

    return () => {
      isDisposed = true;
      abortController.abort();
      window.clearInterval(heartbeatIntervalId);
      window.clearTimeout(pollTimeoutId);
      closePeerConnection();
      stopFireSightUi();
      sendUnregisterCameraBeacon(clientId);
      void unregisterCamera(clientId).catch(() => {
        // The beacon above is the best-effort fallback during page unload.
      });
      cameraStream?.getTracks().forEach((track) => track.stop());
      microphoneStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <FireSightView
      canvasRef={canvasRef}
      modelStatus={modelStatus}
      systemStatus={systemStatus}
      videoRef={videoRef}
    />
  );
}
