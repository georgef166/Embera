import type {
  AnchorGuidanceResponse,
  CreateSpatialAnchorRequest,
  GeoPose,
  SessionSnapshot,
  SpatialAnchor,
} from "@/lib/types";

const apiBasePath = "/api/backend";

async function buildRequestError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  let details = "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        detail?: string;
        error?: string;
      };

      details = payload.error ?? payload.detail ?? "";
    } else {
      details = (await response.text()).trim();
    }
  } catch {
    details = "";
  }

  return details.length > 0
    ? `${fallback}: ${response.status} ${details}`
    : `${fallback}: ${response.status}`;
}

async function fetchBackend(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBasePath}${path}`, {
    cache: "no-store",
    ...init,
  });

  return response;
}

export async function fetchSessionSnapshot(
  sessionId = "demo-session",
): Promise<SessionSnapshot> {
  const response = await fetchBackend(`/sessions/${sessionId}`);

  if (!response.ok) {
    throw new Error(await buildRequestError(response, "Failed to fetch session"));
  }

  return (await response.json()) as SessionSnapshot;
}

export async function simulateSessionTick(sessionId = "demo-session") {
  const response = await fetchBackend(`/sessions/${sessionId}/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      await buildRequestError(response, "Failed to simulate session"),
    );
  }

  return (await response.json()) as SessionSnapshot;
}

export async function fetchSpatialAnchors(): Promise<SpatialAnchor[]> {
  const response = await fetchBackend("/anchors");

  if (!response.ok) {
    throw new Error(await buildRequestError(response, "Failed to fetch anchors"));
  }

  return (await response.json()) as SpatialAnchor[];
}

export async function createSpatialAnchor(
  payload: CreateSpatialAnchorRequest,
): Promise<SpatialAnchor> {
  const response = await fetchBackend("/anchors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await buildRequestError(response, "Failed to create anchor"),
    );
  }

  return (await response.json()) as SpatialAnchor;
}

export async function fetchAnchorGuidance(
  anchorId: string,
  currentPose: GeoPose,
): Promise<AnchorGuidanceResponse> {
  const response = await fetchBackend(`/anchors/${anchorId}/guidance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      currentPose,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await buildRequestError(response, "Failed to fetch anchor guidance"),
    );
  }

  return (await response.json()) as AnchorGuidanceResponse;
}
