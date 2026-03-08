export type PeerRole = "publisher" | "viewer";
export type SignalMessageType = "answer" | "offer" | "viewer-ready";
export type ViewerProfile = "admin-low" | "default";

export type ViewerReadyPayload = {
  preferAudio?: boolean;
  ready: true;
  viewerProfile?: ViewerProfile;
};

export type SignalPayload = RTCSessionDescriptionInit | ViewerReadyPayload;

export type SignalMessage = {
  clientId: string;
  payload: SignalPayload;
  sessionId: string;
  type: SignalMessageType;
};

export type QueuedSignalMessage = SignalMessage & {
  id: number;
};

export type CameraSummary = {
  clientId: string;
  connectedAt: string;
  displayName: string;
  lastSeenAt: string;
};

export type CameraPresence = Pick<CameraSummary, "clientId" | "displayName">;

export const PEER_CONFIGURATION: RTCConfiguration = {
  iceServers: [],
};

export function isPeerRole(value: unknown): value is PeerRole {
  return value === "publisher" || value === "viewer";
}

export function isSignalMessageType(value: unknown): value is SignalMessageType {
  return (
    value === "answer" || value === "offer" || value === "viewer-ready"
  );
}
