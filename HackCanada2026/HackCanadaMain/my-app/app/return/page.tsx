"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { CompassGuidance } from "@/components/compass-guidance";
import { MetricCard } from "@/components/metric-card";
import { ReturnPathScene } from "@/components/return-path-scene";
import { StatusChip } from "@/components/status-chip";
import {
  createSpatialAnchor,
  fetchAnchorGuidance,
  fetchSpatialAnchors,
} from "@/lib/api";
import type {
  AnchorGuidanceResponse,
  GeoPose,
  NavigationMode,
  SpatialAnchor,
} from "@/lib/types";

const DEFAULT_ANCHOR_LABEL = "Return Pin";
const DEFAULT_ANCHOR_NOTE =
  "Pinned from the browser AR return demo for coarse GPS return and local visual reacquire.";

type PositionReading = Omit<GeoPose, "headingDegrees">;
type PointerHint = {
  x: number;
  y: number;
};

type DeviceOrientationEventWithCompass = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

type DeviceOrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"denied" | "granted">;
};

function normalizeHeading(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function extractCompassHeading(event: DeviceOrientationEvent) {
  const webkitHeading = (event as DeviceOrientationEventWithCompass)
    .webkitCompassHeading;

  if (typeof webkitHeading === "number" && !Number.isNaN(webkitHeading)) {
    return normalizeHeading(webkitHeading);
  }

  if (typeof event.alpha === "number" && !Number.isNaN(event.alpha)) {
    return normalizeHeading(360 - event.alpha);
  }

  return null;
}

function formatDistance(distanceMeters?: number) {
  if (typeof distanceMeters !== "number") {
    return "--";
  }

  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(2)} km`;
  }

  return `${distanceMeters.toFixed(1)} m`;
}

function formatHeading(value?: number | null) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${Math.round(value)}°`;
}

function formatAccuracy(value?: number | null) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value.toFixed(1)} m`;
}

function formatAnchorTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function modeTone(mode?: NavigationMode): "danger" | "neutral" | "success" | "warning" {
  switch (mode) {
    case "LOCAL_AR":
      return "success";
    case "RELOCALIZING":
      return "warning";
    case "GLOBAL_RETURN":
      return "neutral";
    default:
      return "danger";
  }
}

function captureReferenceFrame(video: HTMLVideoElement) {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 320 / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export default function ReturnPinPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const orientationCleanupRef = useRef<() => void>(() => {});
  const [anchorLabel, setAnchorLabel] = useState(DEFAULT_ANCHOR_LABEL);
  const [anchorNote, setAnchorNote] = useState(DEFAULT_ANCHOR_NOTE);
  const [anchors, setAnchors] = useState<SpatialAnchor[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [compassError, setCompassError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<AnchorGuidanceResponse | null>(null);
  const [guidanceError, setGuidanceError] = useState<string | null>(null);
  const [headingDegrees, setHeadingDegrees] = useState<number | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loadingAnchors, setLoadingAnchors] = useState(true);
  const [needsCompassPermission, setNeedsCompassPermission] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<PointerHint | null>(null);
  const [position, setPosition] = useState<PositionReading | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingAnchor, setSavingAnchor] = useState(false);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);

  const currentPose: GeoPose | null = position
    ? {
        ...position,
        headingDegrees,
      }
    : null;

  const selectedAnchor =
    anchors.find((anchor) => anchor.anchorId === selectedAnchorId) ?? null;
  const activeAnchor = guidance?.anchor ?? selectedAnchor;
  const overlayPosition =
    guidance && guidance.navigationMode !== "GLOBAL_RETURN"
      ? {
          x: guidance.anchor.localHint.normalizedX,
          y: guidance.anchor.localHint.normalizedY,
          label: guidance.navigationMode === "LOCAL_AR" ? "Reacquire" : "Saved Pin",
        }
      : pendingPoint
        ? {
            x: pendingPoint.x,
            y: pendingPoint.y,
            label: "Staged Pin",
          }
        : null;

  useEffect(() => {
    let isDisposed = false;

    const loadAnchors = async () => {
      try {
        const nextAnchors = await fetchSpatialAnchors();

        if (isDisposed) {
          return;
        }

        setAnchors(nextAnchors);
        setSelectedAnchorId((current) => {
          if (current && nextAnchors.some((anchor) => anchor.anchorId === current)) {
            return current;
          }

          return nextAnchors[0]?.anchorId ?? null;
        });
      } catch (error) {
        if (!isDisposed) {
          setGuidanceError(
            error instanceof Error ? error.message : "Failed to load anchors.",
          );
        }
      } finally {
        if (!isDisposed) {
          setLoadingAnchors(false);
        }
      }
    };

    void loadAnchors();
    const refreshId = window.setInterval(() => {
      void loadAnchors();
    }, 15_000);

    return () => {
      isDisposed = true;
      window.clearInterval(refreshId);
    };
  }, []);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera access requires a secure context such as localhost or a Tailscale HTTPS URL.",
      );
      return;
    }

    let isDisposed = false;
    let cameraStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
        });

        if (isDisposed) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = cameraStream;
          await videoRef.current.play().catch(() => {
            // Some browsers still gate autoplay until the page becomes active.
          });
          setCameraReady(true);
          setCameraError(null);
        }
      } catch (error) {
        setCameraError(
          error instanceof Error
            ? error.message
            : "Unable to start the live camera feed.",
        );
      }
    };

    void startCamera();

    return () => {
      isDisposed = true;
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not available on this device.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (nextPosition) => {
        setPosition({
          latitude: nextPosition.coords.latitude,
          longitude: nextPosition.coords.longitude,
          altitude: nextPosition.coords.altitude ?? null,
          accuracyMeters: nextPosition.coords.accuracy,
        });
        setLocationError(null);
      },
      (error) => {
        setLocationError(error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1500,
        timeout: 10_000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    const attachOrientationListeners = async (requestPermission: boolean) => {
      if (typeof window === "undefined") {
        return;
      }

      const OrientationEventCtor = window.DeviceOrientationEvent as
        | DeviceOrientationConstructor
        | undefined;

      if (!OrientationEventCtor) {
        setCompassError("Compass orientation events are not available here.");
        return;
      }

      if (
        requestPermission &&
        typeof OrientationEventCtor.requestPermission === "function"
      ) {
        const result = await OrientationEventCtor.requestPermission();

        if (result !== "granted") {
          setCompassError("Compass permission was denied.");
          return;
        }
      }

      if (
        !requestPermission &&
        typeof OrientationEventCtor.requestPermission === "function"
      ) {
        setNeedsCompassPermission(true);
        return;
      }

      orientationCleanupRef.current();

      const handleOrientation = (event: DeviceOrientationEvent) => {
        const heading = extractCompassHeading(event);

        if (heading !== null) {
          setHeadingDegrees(Math.round(heading));
          setCompassError(null);
        }
      };

      window.addEventListener(
        "deviceorientationabsolute",
        handleOrientation as EventListener,
        true,
      );
      window.addEventListener(
        "deviceorientation",
        handleOrientation as EventListener,
        true,
      );

      orientationCleanupRef.current = () => {
        window.removeEventListener(
          "deviceorientationabsolute",
          handleOrientation as EventListener,
          true,
        );
        window.removeEventListener(
          "deviceorientation",
          handleOrientation as EventListener,
          true,
        );
      };

      setNeedsCompassPermission(false);
    };

    void attachOrientationListeners(false);

    return () => {
      orientationCleanupRef.current();
    };
  }, []);

  useEffect(() => {
    if (!selectedAnchorId || !position) {
      setGuidance(null);
      return;
    }

    const nextPose: GeoPose = {
      ...position,
      headingDegrees,
    };

    let isDisposed = false;
    const guidanceTimeoutId = window.setTimeout(async () => {
      try {
        const nextGuidance = await fetchAnchorGuidance(selectedAnchorId, nextPose);

        if (!isDisposed) {
          setGuidance(nextGuidance);
          setGuidanceError(null);
        }
      } catch (error) {
        if (!isDisposed) {
          setGuidanceError(
            error instanceof Error
              ? error.message
              : "Failed to calculate return guidance.",
          );
        }
      }
    }, 400);

    return () => {
      isDisposed = true;
      window.clearTimeout(guidanceTimeoutId);
    };
  }, [headingDegrees, position, selectedAnchorId]);

  const handleEnableCompass = async () => {
    try {
      const OrientationEventCtor = window.DeviceOrientationEvent as
        | DeviceOrientationConstructor
        | undefined;

      if (!OrientationEventCtor?.requestPermission) {
        setNeedsCompassPermission(false);
        return;
      }

      const result = await OrientationEventCtor.requestPermission();

      if (result !== "granted") {
        setCompassError("Compass permission was denied.");
        return;
      }

      const handleOrientation = (event: DeviceOrientationEvent) => {
        const heading = extractCompassHeading(event);

        if (heading !== null) {
          setHeadingDegrees(Math.round(heading));
          setCompassError(null);
        }
      };

      orientationCleanupRef.current();
      window.addEventListener(
        "deviceorientationabsolute",
        handleOrientation as EventListener,
        true,
      );
      window.addEventListener(
        "deviceorientation",
        handleOrientation as EventListener,
        true,
      );
      orientationCleanupRef.current = () => {
        window.removeEventListener(
          "deviceorientationabsolute",
          handleOrientation as EventListener,
          true,
        );
        window.removeEventListener(
          "deviceorientation",
          handleOrientation as EventListener,
          true,
        );
      };

      setNeedsCompassPermission(false);
      setCompassError(null);
    } catch (error) {
      setCompassError(
        error instanceof Error
          ? error.message
          : "Unable to enable compass access.",
      );
    }
  };

  const handleStageTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextPoint = {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100,
    };

    setPendingPoint(nextPoint);
    setSaveError(null);
  };

  const handleSaveAnchor = async () => {
    if (!currentPose) {
      setSaveError("A live GPS reading is required before you can save a return pin.");
      return;
    }

    if (!pendingPoint) {
      setSaveError("Tap the live camera preview to place the return pin first.");
      return;
    }

    const videoElement = videoRef.current;

    if (!videoElement) {
      setSaveError("Camera preview is not ready yet.");
      return;
    }

    setSavingAnchor(true);
    setSaveError(null);

    try {
      const anchor = await createSpatialAnchor({
        label: anchorLabel.trim() || DEFAULT_ANCHOR_LABEL,
        note: anchorNote.trim() || DEFAULT_ANCHOR_NOTE,
        globalPose: currentPose,
        localHint: {
          normalizedX: pendingPoint.x,
          normalizedY: pendingPoint.y,
          confidence: currentPose.accuracyMeters <= 10 ? 0.82 : 0.64,
          referenceImageDataUrl: captureReferenceFrame(videoElement),
        },
      });

      setAnchors((current) => [
        anchor,
        ...current.filter((currentAnchor) => currentAnchor.anchorId !== anchor.anchorId),
      ]);
      setSelectedAnchorId(anchor.anchorId);
      setPendingPoint({
        x: anchor.localHint.normalizedX,
        y: anchor.localHint.normalizedY,
      });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save the return pin.",
      );
    } finally {
      setSavingAnchor(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),rgba(2,6,23,0.96)_38%),linear-gradient(180deg,#020617_0%,#020617_100%)] px-4 py-6 text-white lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-300">
              Persistent Return Pin
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              Save a spatial return point, walk away, and navigate back.
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-300">
              This browser prototype uses a live camera frame for local reacquire and
              GPS plus compass for coarse return outside the original space. It is
              the practical web fallback, not full headset-grade world anchoring.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusChip
              label={cameraReady ? "Camera Live" : "Camera Pending"}
              tone={cameraReady ? "success" : "warning"}
            />
            <StatusChip
              label={position ? "GPS Locked" : "GPS Searching"}
              tone={position ? "success" : "warning"}
            />
            <StatusChip
              label={headingDegrees !== null ? "Compass Live" : "Compass Limited"}
              tone={headingDegrees !== null ? "success" : "warning"}
            />
            <StatusChip
              label={guidance?.navigationMode ?? "No Active Anchor"}
              tone={modeTone(guidance?.navigationMode)}
            />
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
          <section className="space-y-4">
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-[0_30px_80px_rgba(2,6,23,0.45)]">
              <div
                className="relative aspect-[4/5] w-full overflow-hidden bg-slate-950 lg:aspect-[16/10]"
                onPointerDown={handleStageTap}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.05),rgba(2,6,23,0.68))]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-4">
                  <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs uppercase tracking-[0.26em] text-white/70 backdrop-blur">
                    Tap the frame to stage a local pin
                  </div>
                  {guidance ? (
                    <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200 backdrop-blur">
                      {guidance.navigationMode.replace("_", " ")}
                    </div>
                  ) : null}
                </div>
                {overlayPosition ? (
                  <div
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${overlayPosition.x}%`,
                      top: `${overlayPosition.y}%`,
                    }}
                  >
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/70 bg-cyan-400/20 shadow-[0_0_32px_rgba(34,211,238,0.65)]">
                      <div className="h-3 w-3 rounded-full bg-cyan-200" />
                      <div className="absolute inset-0 rounded-full border border-cyan-200/50" />
                    </div>
                    <div className="mt-2 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/80 backdrop-blur">
                      {overlayPosition.label}
                    </div>
                  </div>
                ) : null}
                {!cameraReady ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
                    Waiting for a secure-context camera feed so the local pin can be
                    captured against a live view.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Distance"
                value={formatDistance(guidance?.distanceMeters)}
                helper="Coarse GPS distance to the selected anchor."
              />
              <MetricCard
                label="Bearing"
                value={formatHeading(guidance?.bearingDegrees)}
                helper="World bearing back to the saved return point."
              />
              <MetricCard
                label="Heading Delta"
                value={formatHeading(guidance?.headingDeltaDegrees)}
                helper="How far your current heading is off from the anchor bearing."
              />
              <MetricCard
                label="GPS Accuracy"
                value={formatAccuracy(currentPose?.accuracyMeters)}
                helper="Lower is better before saving or reacquiring the pin."
              />
            </div>

            {guidance ? (
              <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <CompassGuidance guidance={guidance.guidance} />
                <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-[0_0_40px_rgba(14,165,233,0.12)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">
                        Return Corridor
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">
                        Synthetic path back to the anchor
                      </h2>
                    </div>
                    <StatusChip
                      label={`${Math.round(guidance.confidence * 100)}% confidence`}
                      tone={modeTone(guidance.navigationMode)}
                    />
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    The 3D path is a guidance visualization derived from current
                    bearing, heading offset, and stored pin metadata.
                  </p>
                  <div className="mt-5">
                    <ReturnPathScene arrows={guidance.returnArrows} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[2rem] border border-dashed border-white/10 bg-slate-950/50 px-6 py-8 text-sm text-slate-300">
                Save or select an anchor to start coarse return guidance. Once you
                are near the original spot, the mode shifts from global return to
                relocalizing and then local AR pin reacquire.
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-[0_0_40px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">
                    Save Anchor
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Pin the current space
                  </h2>
                </div>
                {needsCompassPermission ? (
                  <button
                    type="button"
                    onClick={handleEnableCompass}
                    className="rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200"
                  >
                    Enable compass
                  </button>
                ) : null}
              </div>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Anchor label
                  </span>
                  <input
                    value={anchorLabel}
                    onChange={(event) => setAnchorLabel(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none ring-0 transition focus:border-cyan-300/50"
                    placeholder={DEFAULT_ANCHOR_LABEL}
                  />
                </label>

                <label className="block">
                  <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    Notes
                  </span>
                  <textarea
                    value={anchorNote}
                    onChange={(event) => setAnchorNote(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleSaveAnchor}
                  disabled={savingAnchor}
                  className="w-full rounded-2xl bg-[linear-gradient(135deg,#22d3ee,#2dd4bf)] px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(45,212,191,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingAnchor ? "Saving anchor..." : "Save return pin"}
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    Current pose
                  </p>
                  <p className="mt-2 text-sm text-slate-200">
                    {currentPose
                      ? `${currentPose.latitude.toFixed(5)}, ${currentPose.longitude.toFixed(5)}`
                      : "Waiting for location..."}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    Heading
                  </p>
                  <p className="mt-2 text-sm text-slate-200">
                    {headingDegrees !== null
                      ? `${headingDegrees}°`
                      : needsCompassPermission
                        ? "Permission required"
                        : "Limited / unavailable"}
                  </p>
                </div>
              </div>

              {cameraError || locationError || compassError || saveError ? (
                <div className="mt-4 space-y-2 text-sm text-rose-200">
                  {cameraError ? <p>{cameraError}</p> : null}
                  {locationError ? <p>{locationError}</p> : null}
                  {compassError ? <p>{compassError}</p> : null}
                  {saveError ? <p>{saveError}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-[0_0_40px_rgba(15,23,42,0.35)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">
                    Stored Anchors
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Return points
                  </h2>
                </div>
                <StatusChip
                  label={loadingAnchors ? "Loading" : `${anchors.length} saved`}
                  tone={loadingAnchors ? "warning" : "neutral"}
                />
              </div>

              <div className="mt-4 space-y-3">
                {anchors.length > 0 ? (
                  anchors.map((anchor) => {
                    const isSelected = anchor.anchorId === selectedAnchorId;

                    return (
                      <button
                        key={anchor.anchorId}
                        type="button"
                        onClick={() => {
                          setSelectedAnchorId(anchor.anchorId);
                          setPendingPoint({
                            x: anchor.localHint.normalizedX,
                            y: anchor.localHint.normalizedY,
                          });
                        }}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                          isSelected
                            ? "border-cyan-300/40 bg-cyan-500/10 text-white"
                            : "border-white/10 bg-white/4 text-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{anchor.label}</p>
                            <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                              {anchor.mapId}
                            </p>
                          </div>
                          <StatusChip
                            label={isSelected ? "Active" : "Saved"}
                            tone={isSelected ? "success" : "neutral"}
                          />
                        </div>
                        <p className="mt-3 text-sm text-slate-400">{anchor.note}</p>
                        <p className="mt-3 text-xs text-slate-500">
                          {formatAnchorTime(anchor.createdAt)}
                        </p>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
                    No return anchors saved yet. Tap the camera frame, then save a
                    pin to create your first return point.
                  </div>
                )}
              </div>
            </div>

            {activeAnchor?.localHint.referenceImageDataUrl ? (
              <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-[0_0_40px_rgba(15,23,42,0.35)]">
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">
                  Visual Reacquire
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Saved reference frame
                </h2>
                <p className="mt-3 text-sm text-slate-300">
                  When the navigation mode becomes local or relocalizing, match the
                  live camera view to this saved frame to snap back to the original
                  pin location.
                </p>
                <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={activeAnchor.localHint.referenceImageDataUrl}
                    alt={`Saved reference for ${activeAnchor.label}`}
                    className="h-auto w-full object-cover"
                  />
                </div>
              </div>
            ) : null}

            {guidanceError ? (
              <div className="rounded-[2rem] border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
                {guidanceError}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
