import { NextRequest, NextResponse } from "next/server";
import {
  isPeerRole,
  isSignalMessageType,
  type CameraPresence,
  type CameraSummary,
  type PeerRole,
  type QueuedSignalMessage,
  type SignalMessage,
} from "@/lib/webrtc-signaling-shared";

type CameraRecord = CameraSummary & {
  connectedAtMs: number;
  lastSeenMs: number;
};

type SignalingStore = {
  cameras: Record<string, CameraRecord>;
  nextId: number;
  publisherQueues: Record<string, QueuedSignalMessage[]>;
  viewerQueue: QueuedSignalMessage[];
};

type SignalPostBody = {
  action: "signal";
  message: SignalMessage;
  target: PeerRole;
};

type UpsertCameraPostBody = {
  action: "upsert-camera";
  camera: CameraPresence;
};

type UnregisterCameraPostBody = {
  action: "unregister-camera";
  clientId: string;
};

const signalingGlobal = globalThis as typeof globalThis & {
  __signalingStore?: SignalingStore;
};
const CAMERA_STALE_MS = 30_000;
const MAX_QUEUE_SIZE = 200;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createInternalErrorResponse(context: "GET" | "POST", error: unknown) {
  console.error(`Unhandled /api/webrtc ${context} failure.`, error);

  return NextResponse.json(
    { error: "Internal signaling error." },
    { status: 500 },
  );
}

function getStore(): SignalingStore {
  if (!signalingGlobal.__signalingStore) {
    signalingGlobal.__signalingStore = {
      cameras: {},
      nextId: 1,
      publisherQueues: {},
      viewerQueue: [],
    };
  }

  return signalingGlobal.__signalingStore;
}

function trimQueue(queue: QueuedSignalMessage[]) {
  if (queue.length > MAX_QUEUE_SIZE) {
    queue.splice(0, queue.length - MAX_QUEUE_SIZE);
  }
}

function getPublisherQueue(
  store: SignalingStore,
  clientId: string,
): QueuedSignalMessage[] {
  if (!store.publisherQueues[clientId]) {
    store.publisherQueues[clientId] = [];
  }

  return store.publisherQueues[clientId];
}

function normalizeDisplayName(displayName: string, clientId: string) {
  const trimmed = displayName.trim().slice(0, 80);

  if (trimmed.length > 0) {
    return trimmed;
  }

  return `Camera ${clientId.slice(0, 4).toUpperCase()}`;
}

function pruneStaleCameras(store: SignalingStore) {
  const cutoff = Date.now() - CAMERA_STALE_MS;

  for (const [clientId, camera] of Object.entries(store.cameras)) {
    if (camera.lastSeenMs < cutoff) {
      delete store.cameras[clientId];
    }
  }

  const activeClientIds = new Set(Object.keys(store.cameras));
  store.viewerQueue = store.viewerQueue.filter(
    (message) =>
      message.type !== "offer" || activeClientIds.has(message.clientId),
  );
}

function isSignalMessage(value: unknown): value is SignalMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SignalMessage>;

  return (
    typeof candidate.clientId === "string" &&
    candidate.clientId.length > 0 &&
    typeof candidate.sessionId === "string" &&
    isSignalMessageType(candidate.type) &&
    !!candidate.payload &&
    typeof candidate.payload === "object"
  );
}

function isCameraPresence(value: unknown): value is CameraPresence {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CameraPresence>;

  return (
    typeof candidate.clientId === "string" &&
    candidate.clientId.length > 0 &&
    typeof candidate.displayName === "string"
  );
}

function isSignalPostBody(value: unknown): value is SignalPostBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    action?: unknown;
    message?: unknown;
    target?: unknown;
  };

  return (
    candidate.action === "signal" &&
    isPeerRole(candidate.target) &&
    isSignalMessage(candidate.message)
  );
}

function isUpsertCameraPostBody(value: unknown): value is UpsertCameraPostBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    action?: unknown;
    camera?: unknown;
  };

  return (
    candidate.action === "upsert-camera" && isCameraPresence(candidate.camera)
  );
}

function isUnregisterCameraPostBody(
  value: unknown,
): value is UnregisterCameraPostBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    action?: unknown;
    clientId?: unknown;
  };

  return (
    candidate.action === "unregister-camera" &&
    typeof candidate.clientId === "string" &&
    candidate.clientId.length > 0
  );
}

function queueSignal(
  store: SignalingStore,
  target: PeerRole,
  message: SignalMessage,
) {
  const queuedMessage: QueuedSignalMessage = {
    id: store.nextId,
    ...message,
  };

  store.nextId += 1;

  if (target === "viewer") {
    if (message.type === "offer") {
      store.viewerQueue = store.viewerQueue.filter(
        (queued) =>
          !(
            queued.type === "offer" && queued.clientId === message.clientId
          ),
      );
    }

    store.viewerQueue.push(queuedMessage);
    trimQueue(store.viewerQueue);
    return queuedMessage.id;
  }

  const queue = getPublisherQueue(store, message.clientId);

  if (message.type === "viewer-ready") {
    store.publisherQueues[message.clientId] = queue.filter(
      (queued) => queued.type !== "viewer-ready",
    );
  }

  getPublisherQueue(store, message.clientId).push(queuedMessage);
  trimQueue(store.publisherQueues[message.clientId]);
  return queuedMessage.id;
}

export async function GET(request: NextRequest) {
  try {
    const store = getStore();
    pruneStaleCameras(store);

    const resource = request.nextUrl.searchParams.get("resource");

    if (resource === "cameras") {
      const cameras = Object.values(store.cameras)
        .sort((left, right) => {
          const byName = left.displayName.localeCompare(right.displayName);

          if (byName !== 0) {
            return byName;
          }

          return left.connectedAtMs - right.connectedAtMs;
        })
        .map(({ connectedAt, clientId, displayName, lastSeenAt }) => ({
          clientId,
          connectedAt,
          displayName,
          lastSeenAt,
        }));

      return NextResponse.json({ cameras });
    }

    const client = request.nextUrl.searchParams.get("client");
    const after = Number(request.nextUrl.searchParams.get("after") ?? "0");
    const clientId = request.nextUrl.searchParams.get("clientId");

    if (
      !isPeerRole(client) ||
      Number.isNaN(after) ||
      after < 0 ||
      (client === "publisher" && (!clientId || clientId.length === 0))
    ) {
      return NextResponse.json(
        { error: "Invalid signaling poll parameters." },
        { status: 400 },
      );
    }

    const messages =
      client === "viewer"
        ? store.viewerQueue.filter((message) => message.id > after)
        : (store.publisherQueues[clientId as string] ?? []).filter(
            (message) => message.id > after,
          );

    return NextResponse.json({ messages });
  } catch (error) {
    return createInternalErrorResponse("GET", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid signaling payload." },
        { status: 400 },
      );
    }

    const store = getStore();
    pruneStaleCameras(store);

    if (isSignalPostBody(body)) {
      const id = queueSignal(store, body.target, body.message);

      return NextResponse.json({ id, ok: true });
    }

    if (isUpsertCameraPostBody(body)) {
      const now = Date.now();
      const existing = store.cameras[body.camera.clientId];
      const connectedAtMs = existing?.connectedAtMs ?? now;

      store.cameras[body.camera.clientId] = {
        clientId: body.camera.clientId,
        connectedAt: new Date(connectedAtMs).toISOString(),
        connectedAtMs,
        displayName: normalizeDisplayName(
          body.camera.displayName,
          body.camera.clientId,
        ),
        lastSeenAt: new Date(now).toISOString(),
        lastSeenMs: now,
      };

      return NextResponse.json({ ok: true });
    }

    if (isUnregisterCameraPostBody(body)) {
      delete store.cameras[body.clientId];

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Invalid signaling payload." },
      { status: 400 },
    );
  } catch (error) {
    return createInternalErrorResponse("POST", error);
  }
}
