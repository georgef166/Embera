export type Priority = "critical" | "high" | "medium" | "low";

export type SessionStatus = "active" | "monitoring" | "degraded";

export type SafeDirection = "LEFT" | "FORWARD" | "RIGHT";
export type NavigationMode = "LOCAL_AR" | "GLOBAL_RETURN" | "RELOCALIZING";

export interface Detection {
  id: string;
  label: string;
  category: string;
  description: string;
  priority: Priority;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Breadcrumb {
  id: string;
  x: number;
  y: number;
  age: number;
}

export interface ReturnArrow {
  id: string;
  x: number;
  y: number;
  z: number;
  directionX: number;
  directionY: number;
  directionZ: number;
  label: string;
}

export interface Biometrics {
  heartRate: number;
  oxygen: number;
  stressIndex: number;
  skinTempC: number;
  battery: number;
  lastUpdated: string;
}

export interface Guidance {
  safeDirection: SafeDirection;
  headingDegrees: number;
  confidence: number;
  cueLabel: string;
  riskLevel: Priority;
  reason: string;
}

export interface SessionSnapshot {
  sessionId: string;
  incidentName: string;
  firefighterName: string;
  status: SessionStatus;
  lastUpdated: string;
  streamHealth: number;
  environment: string;
  feedLabel: string;
  note: string;
  biometrics: Biometrics;
  guidance: Guidance;
  detections: Detection[];
  breadcrumbs: Breadcrumb[];
  returnArrows: ReturnArrow[];
}

export interface GeoPose {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracyMeters: number;
  headingDegrees: number | null;
}

export interface LocalAnchorHint {
  normalizedX: number;
  normalizedY: number;
  confidence: number;
  referenceImageDataUrl: string | null;
}

export interface SpatialAnchor {
  anchorId: string;
  label: string;
  mapId: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  globalPose: GeoPose;
  localHint: LocalAnchorHint;
}

export interface CreateSpatialAnchorRequest {
  label: string;
  note?: string;
  globalPose: GeoPose;
  localHint: LocalAnchorHint;
}

export interface AnchorGuidanceResponse {
  anchor: SpatialAnchor;
  navigationMode: NavigationMode;
  distanceMeters: number;
  bearingDegrees: number;
  headingDeltaDegrees: number | null;
  confidence: number;
  guidance: Guidance;
  breadcrumbs: Breadcrumb[];
  returnArrows: ReturnArrow[];
}
