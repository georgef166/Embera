import type {
  CameraPresence,
  CameraSummary,
  PeerRole,
  QueuedSignalMessage,
  SignalMessage,
} from "@/lib/webrtc-signaling-shared";

export type {
  CameraPresence,
  CameraSummary,
  PeerRole,
  QueuedSignalMessage,
  SignalMessage,
  SignalMessageType,
  SignalPayload,
  ViewerProfile,
  ViewerReadyPayload,
} from "@/lib/webrtc-signaling-shared";
export {
  PEER_CONFIGURATION,
  isPeerRole,
  isSignalMessageType,
} from "@/lib/webrtc-signaling-shared";

async function readErrorDetail(response: Response) {
  try {
    const detail = (await response.text()).trim();

    return detail.length > 0 ? detail : "";
  } catch {
    return "";
  }
}

export async function sendSignal(
  target: PeerRole,
  message: SignalMessage,
): Promise<void> {
  const response = await fetch("/api/webrtc", {
    body: JSON.stringify({
      action: "signal",
      message,
      target,
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      `Failed to send ${message.type} to ${target} (${response.status})${detail ? `: ${detail}` : ""}.`,
    );
  }
}

export async function pollSignals(
  client: PeerRole,
  after: number,
  options: {
    clientId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<QueuedSignalMessage[]> {
  const params = new URLSearchParams({
    after: String(after),
    client,
  });

  if (options.clientId) {
    params.set("clientId", options.clientId);
  }

  const response = await fetch(`/api/webrtc?${params.toString()}`, {
    cache: "no-store",
    method: "GET",
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      `Failed to poll signals for ${client} (${response.status})${detail ? `: ${detail}` : ""}.`,
    );
  }

  const data = (await response.json()) as {
    messages?: QueuedSignalMessage[];
  };

  return data.messages ?? [];
}

export async function listCameras(signal?: AbortSignal): Promise<CameraSummary[]> {
  const response = await fetch("/api/webrtc?resource=cameras", {
    cache: "no-store",
    method: "GET",
    signal,
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      `Failed to list connected cameras (${response.status})${detail ? `: ${detail}` : ""}.`,
    );
  }

  const data = (await response.json()) as {
    cameras?: CameraSummary[];
  };

  return data.cameras ?? [];
}

export async function upsertCameraPresence(
  camera: CameraPresence,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/webrtc", {
    body: JSON.stringify({
      action: "upsert-camera",
      camera,
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      `Failed to update presence for ${camera.clientId} (${response.status})${detail ? `: ${detail}` : ""}.`,
    );
  }
}

export async function unregisterCamera(clientId: string): Promise<void> {
  const response = await fetch("/api/webrtc", {
    body: JSON.stringify({
      action: "unregister-camera",
      clientId,
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    keepalive: true,
    method: "POST",
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      `Failed to unregister ${clientId} (${response.status})${detail ? `: ${detail}` : ""}.`,
    );
  }
}

export function sendUnregisterCameraBeacon(clientId: string) {
  if (typeof navigator === "undefined" || !navigator.sendBeacon) {
    return;
  }

  const payload = new Blob(
    [
      JSON.stringify({
        action: "unregister-camera",
        clientId,
      }),
    ],
    {
      type: "application/json",
    },
  );

  navigator.sendBeacon("/api/webrtc", payload);
}

export async function waitForIceGatheringComplete(
  peerConnection: RTCPeerConnection,
  timeoutMs = 4000,
): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return;
  }

  await new Promise<void>((resolve) => {
    const finish = () => {
      window.clearTimeout(timeoutId);
      peerConnection.removeEventListener(
        "icegatheringstatechange",
        handleStateChange,
      );
      resolve();
    };

    const handleStateChange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        finish();
      }
    };

    const timeoutId = window.setTimeout(finish, timeoutMs);

    peerConnection.addEventListener(
      "icegatheringstatechange",
      handleStateChange,
    );
  });
}

function getPreferredCodecOrder(mimeType: string): RTCRtpCodec[] | null {
  const senderCapabilities =
    typeof RTCRtpSender !== "undefined"
      ? RTCRtpSender.getCapabilities("video")
      : null;
  const receiverCapabilities =
    typeof RTCRtpReceiver !== "undefined"
      ? RTCRtpReceiver.getCapabilities("video")
      : null;
  const codecs = senderCapabilities?.codecs ?? receiverCapabilities?.codecs;

  if (!codecs || codecs.length === 0) {
    return null;
  }

  const normalizedMimeType = mimeType.toLowerCase();
  const preferredCodecs = codecs.filter(
    (codec) => codec.mimeType.toLowerCase() === normalizedMimeType,
  );

  if (preferredCodecs.length === 0) {
    return null;
  }

  const fallbackCodecs = codecs.filter(
    (codec) => codec.mimeType.toLowerCase() !== normalizedMimeType,
  );

  return [...preferredCodecs, ...fallbackCodecs];
}

function getVideoTransceiver(peerConnection: RTCPeerConnection) {
  return (
    peerConnection
      .getTransceivers()
      .find(
        (transceiver) =>
          transceiver.sender.track?.kind === "video" ||
          transceiver.receiver.track?.kind === "video",
      ) ?? null
  );
}

export function preferVideoCodec(
  peerConnection: RTCPeerConnection,
  mimeType: string,
): boolean {
  const transceiver = getVideoTransceiver(peerConnection);

  if (!transceiver || typeof transceiver.setCodecPreferences !== "function") {
    return false;
  }

  const codecs = getPreferredCodecOrder(mimeType);

  if (!codecs) {
    return false;
  }

  try {
    transceiver.setCodecPreferences(codecs);
    return true;
  } catch (error) {
    console.warn(`Failed to prefer ${mimeType} for the video transceiver.`, error);
    return false;
  }
}
