from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from math import atan2, cos, degrees, radians, sin, sqrt
from random import Random
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import json
import logging

logger = logging.getLogger("uvicorn.error")


class Detection(BaseModel):
    id: str
    label: str
    category: str
    description: str
    priority: Literal["critical", "high", "medium", "low"]
    confidence: float = Field(ge=0, le=1)
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    width: float = Field(ge=0, le=100)
    height: float = Field(ge=0, le=100)


class Breadcrumb(BaseModel):
    id: str
    x: float
    y: float
    age: int


class ReturnArrow(BaseModel):
    id: str
    x: float
    y: float
    z: float
    directionX: float
    directionY: float
    directionZ: float
    label: str


class Biometrics(BaseModel):
    heartRate: int
    oxygen: int
    stressIndex: int
    skinTempC: float
    battery: int
    lastUpdated: str


class Guidance(BaseModel):
    safeDirection: Literal["LEFT", "FORWARD", "RIGHT"]
    headingDegrees: int
    confidence: float = Field(ge=0, le=1)
    cueLabel: str
    riskLevel: Literal["critical", "high", "medium", "low"]
    reason: str


class GeoPose(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude: float | None = None
    accuracyMeters: float = Field(ge=0)
    headingDegrees: float | None = None


class LocalAnchorHint(BaseModel):
    normalizedX: float = Field(ge=0, le=100)
    normalizedY: float = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    referenceImageDataUrl: str | None = None


class SpatialAnchor(BaseModel):
    anchorId: str
    label: str
    mapId: str
    note: str
    createdAt: str
    updatedAt: str
    globalPose: GeoPose
    localHint: LocalAnchorHint


class CreateSpatialAnchorRequest(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    note: str = Field(default="", max_length=240)
    globalPose: GeoPose
    localHint: LocalAnchorHint


class AnchorGuidanceRequest(BaseModel):
    currentPose: GeoPose


class AnchorGuidanceResponse(BaseModel):
    anchor: SpatialAnchor
    navigationMode: Literal["LOCAL_AR", "GLOBAL_RETURN", "RELOCALIZING"]
    distanceMeters: float = Field(ge=0)
    bearingDegrees: int = Field(ge=0, le=359)
    headingDeltaDegrees: float | None = None
    confidence: float = Field(ge=0, le=1)
    guidance: Guidance
    breadcrumbs: list[Breadcrumb]
    returnArrows: list[ReturnArrow]


class SessionSnapshot(BaseModel):
    sessionId: str
    incidentName: str
    firefighterName: str
    status: Literal["active", "monitoring", "degraded"]
    lastUpdated: str
    streamHealth: int
    environment: str
    feedLabel: str
    note: str
    biometrics: Biometrics
    guidance: Guidance
    detections: list[Detection]
    breadcrumbs: list[Breadcrumb]
    returnArrows: list[ReturnArrow]


def utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


EARTH_RADIUS_METERS = 6_371_000
LOCAL_AR_RADIUS_METERS = 8
RELOCALIZATION_RADIUS_METERS = 20
ANCHOR_MAP_ID = "gps-compass-demo"


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def normalize_heading(value: float) -> float:
    return value % 360


def haversine_distance_meters(start: GeoPose, end: GeoPose) -> float:
    start_lat = radians(start.latitude)
    end_lat = radians(end.latitude)
    delta_lat = radians(end.latitude - start.latitude)
    delta_lon = radians(end.longitude - start.longitude)

    a = (
        sin(delta_lat / 2) ** 2
        + cos(start_lat) * cos(end_lat) * sin(delta_lon / 2) ** 2
    )
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return EARTH_RADIUS_METERS * c


def bearing_degrees(start: GeoPose, end: GeoPose) -> float:
    start_lat = radians(start.latitude)
    end_lat = radians(end.latitude)
    delta_lon = radians(end.longitude - start.longitude)

    y = sin(delta_lon) * cos(end_lat)
    x = cos(start_lat) * sin(end_lat) - sin(start_lat) * cos(end_lat) * cos(delta_lon)
    return normalize_heading(degrees(atan2(y, x)))


def heading_delta_degrees(target_heading: float, current_heading: float | None) -> float | None:
    if current_heading is None:
        return None

    return round((target_heading - current_heading + 540) % 360 - 180, 1)


def resolve_navigation_mode(
    distance_meters: float,
) -> Literal["LOCAL_AR", "GLOBAL_RETURN", "RELOCALIZING"]:
    if distance_meters <= LOCAL_AR_RADIUS_METERS:
        return "LOCAL_AR"

    if distance_meters <= RELOCALIZATION_RADIUS_METERS:
        return "RELOCALIZING"

    return "GLOBAL_RETURN"


def resolve_safe_direction(heading_delta: float | None) -> Literal["LEFT", "FORWARD", "RIGHT"]:
    if heading_delta is None or abs(heading_delta) <= 18:
        return "FORWARD"

    return "RIGHT" if heading_delta > 0 else "LEFT"


def build_anchor_breadcrumbs(heading_delta: float | None) -> list[Breadcrumb]:
    lateral_bias = clamp((heading_delta or 0) / 70, -1, 1)
    return [
        Breadcrumb(
            id=f"anchor-crumb-{step}",
            x=round((1 - step / 4) * 3.4 * lateral_bias, 2),
            y=round(2.8 - step * 0.95, 2),
            age=4 - step,
        )
        for step in range(5)
    ]


def build_anchor_return_arrows(
    label: str,
    heading_delta: float | None,
    distance_meters: float,
) -> list[ReturnArrow]:
    lateral_bias = clamp((heading_delta or 0) / 70, -1, 1)
    distance_scale = clamp(distance_meters / 30, 0.3, 1)
    labels = [
        "Acquire heading",
        "Close the gap",
        "Approach anchor",
        label,
    ]
    arrows: list[ReturnArrow] = []

    for index in range(4):
        progress = index / 3
        x = round((1 - progress) * 3.0 * lateral_bias, 2)
        z = round(-1.8 + progress * 3.2, 2)
        direction_x = round(clamp(-lateral_bias * 0.95, -1, 1), 2)
        direction_z = round(clamp(0.32 + (1 - progress) * 0.48 * distance_scale, 0.18, 1), 2)

        arrows.append(
            ReturnArrow(
                id=f"anchor-arrow-{index + 1}",
                x=x,
                y=0.1,
                z=z,
                directionX=direction_x,
                directionY=0,
                directionZ=direction_z,
                label=labels[index],
            )
        )

    return arrows


def build_anchor_guidance(anchor: SpatialAnchor, current_pose: GeoPose) -> AnchorGuidanceResponse:
    distance_meters = haversine_distance_meters(current_pose, anchor.globalPose)
    bearing = bearing_degrees(current_pose, anchor.globalPose)
    heading_delta = heading_delta_degrees(bearing, current_pose.headingDegrees)
    navigation_mode = resolve_navigation_mode(distance_meters)
    safe_direction = resolve_safe_direction(heading_delta)

    if navigation_mode == "LOCAL_AR":
        cue_label = "Local anchor is within visual reacquire range"
        reason = "Use the saved frame and pin overlay to align back to the exact spot."
        risk_level = "low"
        base_confidence = 0.92
    elif navigation_mode == "RELOCALIZING":
        cue_label = "Re-enter the saved camera frame"
        reason = "You are close enough for camera-based reacquisition. Match the live view to the saved pin reference."
        risk_level = "medium"
        base_confidence = 0.79
    else:
        cue_lookup = {
            "LEFT": "Turn left toward the return anchor",
            "FORWARD": "Continue forward toward the return anchor",
            "RIGHT": "Turn right toward the return anchor",
        }
        reason_lookup = {
            "LEFT": "Your heading is offset left of the stored anchor bearing.",
            "FORWARD": "Your heading is roughly aligned with the stored anchor bearing.",
            "RIGHT": "Your heading is offset right of the stored anchor bearing.",
        }
        cue_label = cue_lookup[safe_direction]
        reason = reason_lookup[safe_direction]
        risk_level = "medium" if distance_meters < 60 else "high"
        base_confidence = 0.68

    confidence_penalty = clamp(current_pose.accuracyMeters / 80, 0, 0.35)
    confidence = round(clamp(base_confidence - confidence_penalty, 0.35, 0.96), 2)

    return AnchorGuidanceResponse(
        anchor=anchor,
        navigationMode=navigation_mode,
        distanceMeters=round(distance_meters, 1),
        bearingDegrees=int(round(bearing)) % 360,
        headingDeltaDegrees=heading_delta,
        confidence=confidence,
        guidance=Guidance(
            safeDirection=safe_direction,
            headingDegrees=int(round(bearing)) % 360,
            confidence=confidence,
            cueLabel=cue_label,
            riskLevel=risk_level,
            reason=f"{reason} Distance to pin is {round(distance_meters, 1)} m.",
        ),
        breadcrumbs=build_anchor_breadcrumbs(heading_delta),
        returnArrows=build_anchor_return_arrows(
            anchor.label,
            heading_delta,
            distance_meters,
        ),
    )


def build_default_session() -> SessionSnapshot:
    timestamp = utc_now_iso()
    return SessionSnapshot(
        sessionId="demo-session",
        incidentName="Interior Search Training Burn",
        firefighterName="George Squad Lead",
        status="active",
        lastUpdated=timestamp,
        streamHealth=92,
        environment="Residential smoke simulation · first floor",
        feedLabel="Chest camera · XR mirrored guidance",
        note="Return path is visible for commanders while the firefighter sees a compact forward compass cue.",
        biometrics=Biometrics(
            heartRate=122,
            oxygen=97,
            stressIndex=58,
            skinTempC=37.6,
            battery=84,
            lastUpdated=timestamp,
        ),
        guidance=Guidance(
            safeDirection="FORWARD",
            headingDegrees=12,
            confidence=0.83,
            cueLabel="Clear corridor ahead",
            riskLevel="medium",
            reason="Center lane remains open; debris cluster is left of travel.",
        ),
        detections=[
            Detection(
                id="exit-door",
                label="Exit door",
                category="egress",
                description="Potential safe egress point through the hallway opening.",
                priority="critical",
                confidence=0.97,
                x=68,
                y=18,
                width=16,
                height=46,
            ),
            Detection(
                id="fallen-cabinet",
                label="Fallen cabinet",
                category="obstacle",
                description="Large object partially blocking the left approach.",
                priority="high",
                confidence=0.91,
                x=16,
                y=44,
                width=25,
                height=30,
            ),
            Detection(
                id="oxygen-tank",
                label="Medical oxygen tank",
                category="priority-asset",
                description="Important rescue asset detected near the wall.",
                priority="high",
                confidence=0.78,
                x=58,
                y=54,
                width=10,
                height=18,
            ),
        ],
        breadcrumbs=[
            Breadcrumb(id="crumb-1", x=-3.8, y=2.8, age=5),
            Breadcrumb(id="crumb-2", x=-2.1, y=1.3, age=4),
            Breadcrumb(id="crumb-3", x=-0.7, y=0.4, age=3),
            Breadcrumb(id="crumb-4", x=1.2, y=-0.3, age=2),
            Breadcrumb(id="crumb-5", x=2.7, y=-1.2, age=1),
        ],
        returnArrows=[
            ReturnArrow(
                id="arrow-1",
                x=3.4,
                y=0.1,
                z=-1.6,
                directionX=-1,
                directionY=0,
                directionZ=0.1,
                label="Return to entry",
            ),
            ReturnArrow(
                id="arrow-2",
                x=1.6,
                y=0.1,
                z=-0.6,
                directionX=-0.8,
                directionY=0,
                directionZ=0.35,
                label="Keep left of debris",
            ),
            ReturnArrow(
                id="arrow-3",
                x=-0.2,
                y=0.1,
                z=0.8,
                directionX=-0.55,
                directionY=0,
                directionZ=0.5,
                label="Back to staging",
            ),
        ],
    )


app = FastAPI(title="Firefighter HUD Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"https://.*\.ts\.net",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_store: dict[str, SessionSnapshot] = {"demo-session": build_default_session()}
simulation_seed: dict[str, int] = {"demo-session": 4}
anchor_store: dict[str, SpatialAnchor] = {}


def get_session_or_404(session_id: str) -> SessionSnapshot:
    snapshot = session_store.get(session_id)

    if snapshot is None:
        raise HTTPException(status_code=404, detail="Session not found")

    return snapshot


def get_anchor_or_404(anchor_id: str) -> SpatialAnchor:
    anchor = anchor_store.get(anchor_id)

    if anchor is None:
        raise HTTPException(status_code=404, detail="Anchor not found")

    return anchor


def create_detections(index: int) -> list[Detection]:
    left_shift = (index % 3) * 4
    right_shift = (index % 4) * 2

    return [
        Detection(
            id="exit-door",
            label="Exit door",
            category="egress",
            description="Potential safe egress point through the hallway opening.",
            priority="critical",
            confidence=0.95,
            x=64 + right_shift,
            y=16,
            width=16,
            height=48,
        ),
        Detection(
            id="fallen-cabinet",
            label="Fallen cabinet",
            category="obstacle",
            description="Large object is forcing the safe corridor toward the center-right lane.",
            priority="high",
            confidence=0.88,
            x=14 + left_shift,
            y=46,
            width=24,
            height=28,
        ),
        Detection(
            id="sofa",
            label="Collapsed sofa",
            category="obstacle",
            description="Soft debris mass may trap feet on the right edge of travel.",
            priority="medium",
            confidence=0.8,
            x=57,
            y=62,
            width=18,
            height=20,
        ),
        Detection(
            id="priority-asset",
            label="Medic kit",
            category="priority-asset",
            description="Potentially important rescue equipment detected near the wall.",
            priority="high",
            confidence=0.74,
            x=46,
            y=54,
            width=10,
            height=14,
        ),
    ]


def create_breadcrumbs(index: int) -> list[Breadcrumb]:
    return [
        Breadcrumb(id=f"crumb-{step}", x=-4 + step * 1.5, y=2.8 - step * 0.9, age=5 - step)
        for step in range(5)
    ] + [Breadcrumb(id="crumb-live", x=3.1 + index * 0.3, y=-1.4 - index * 0.1, age=0)]


def create_return_arrows(index: int) -> list[ReturnArrow]:
    base_x = 3.2 + (index % 2) * 0.2
    return [
        ReturnArrow(
            id="arrow-1",
            x=base_x,
            y=0.1,
            z=-1.8,
            directionX=-0.95,
            directionY=0,
            directionZ=0.12,
            label="Back to entry",
        ),
        ReturnArrow(
            id="arrow-2",
            x=1.3,
            y=0.1,
            z=-0.9,
            directionX=-0.78,
            directionY=0,
            directionZ=0.33,
            label="Slide center",
        ),
        ReturnArrow(
            id="arrow-3",
            x=-0.4,
            y=0.1,
            z=0.2,
            directionX=-0.62,
            directionY=0,
            directionZ=0.44,
            label="Stay clear left",
        ),
        ReturnArrow(
            id="arrow-4",
            x=-2.1,
            y=0.1,
            z=1.4,
            directionX=-0.42,
            directionY=0,
            directionZ=0.68,
            label="Staging zone",
        ),
    ]


def simulate_session(snapshot: SessionSnapshot, seed: int) -> SessionSnapshot:
    random = Random(seed)
    direction_cycle = ["LEFT", "FORWARD", "RIGHT"]
    next_direction = direction_cycle[seed % len(direction_cycle)]
    next_status = "active" if seed % 5 else "monitoring"
    stream_health = max(62, min(99, snapshot.streamHealth + random.randint(-6, 4)))
    heart_rate = max(108, min(154, snapshot.biometrics.heartRate + random.randint(-4, 6)))
    oxygen = max(93, min(99, snapshot.biometrics.oxygen + random.randint(-1, 1)))
    stress_index = max(41, min(88, snapshot.biometrics.stressIndex + random.randint(-3, 5)))
    skin_temp = max(36.8, min(38.9, snapshot.biometrics.skinTempC + random.uniform(-0.2, 0.18)))
    battery = max(28, snapshot.biometrics.battery - random.randint(0, 2))
    heading = (snapshot.guidance.headingDegrees + random.randint(-18, 18)) % 360
    updated_at = utc_now_iso()

    reason_lookup = {
        "LEFT": "Thermal clutter ahead; safer gap detected to the left of the obstacle cluster.",
        "FORWARD": "Center lane remains most open after obstacle scan refresh.",
        "RIGHT": "Left corridor is tightening; right side offers more clearance around furniture.",
    }

    cue_lookup = {
        "LEFT": "Veer left around the debris wall",
        "FORWARD": "Continue forward through the clear corridor",
        "RIGHT": "Shift right toward the safer lane",
    }

    return SessionSnapshot(
        sessionId=snapshot.sessionId,
        incidentName=snapshot.incidentName,
        firefighterName=snapshot.firefighterName,
        status=next_status,
        lastUpdated=updated_at,
        streamHealth=stream_health,
        environment=snapshot.environment,
        feedLabel=snapshot.feedLabel,
        note="Observer HUD mirrors the firefighter context while rendering a separate three.js route back to safety.",
        biometrics=Biometrics(
            heartRate=heart_rate,
            oxygen=oxygen,
            stressIndex=stress_index,
            skinTempC=round(skin_temp, 1),
            battery=battery,
            lastUpdated=updated_at,
        ),
        guidance=Guidance(
            safeDirection=next_direction,
            headingDegrees=heading,
            confidence=round(random.uniform(0.72, 0.95), 2),
            cueLabel=cue_lookup[next_direction],
            riskLevel="high" if next_direction != "FORWARD" else "medium",
            reason=reason_lookup[next_direction],
        ),
        detections=create_detections(seed),
        breadcrumbs=create_breadcrumbs(seed),
        returnArrows=create_return_arrows(seed),
    )


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "timestamp": utc_now_iso()}


@app.get("/api/sessions")
def list_sessions() -> list[SessionSnapshot]:
    return [deepcopy(snapshot) for snapshot in session_store.values()]


@app.post("/api/sessions")
def create_session() -> SessionSnapshot:
    session_id = f"demo-session-{len(session_store) + 1}"
    snapshot = build_default_session().model_copy(update={"sessionId": session_id})
    session_store[session_id] = snapshot
    simulation_seed[session_id] = 1
    return deepcopy(snapshot)


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str) -> SessionSnapshot:
    return deepcopy(get_session_or_404(session_id))


@app.get("/api/sessions/{session_id}/telemetry")
def get_session_telemetry(session_id: str) -> dict[str, object]:
    snapshot = get_session_or_404(session_id)
    return {
        "sessionId": snapshot.sessionId,
        "streamHealth": snapshot.streamHealth,
        "status": snapshot.status,
        "biometrics": snapshot.biometrics,
        "guidance": snapshot.guidance,
    }


@app.get("/api/sessions/{session_id}/detections")
def get_session_detections(session_id: str) -> dict[str, object]:
    snapshot = get_session_or_404(session_id)
    return {
        "sessionId": snapshot.sessionId,
        "detections": snapshot.detections,
        "lastUpdated": snapshot.lastUpdated,
    }


@app.get("/api/sessions/{session_id}/path")
def get_session_path(session_id: str) -> dict[str, object]:
    snapshot = get_session_or_404(session_id)
    return {
        "sessionId": snapshot.sessionId,
        "breadcrumbs": snapshot.breadcrumbs,
        "returnArrows": snapshot.returnArrows,
        "lastUpdated": snapshot.lastUpdated,
    }


@app.post("/api/sessions/{session_id}/simulate")
def simulate_session_tick(session_id: str) -> SessionSnapshot:
    snapshot = get_session_or_404(session_id)
    next_seed = simulation_seed.get(session_id, 1) + 1
    simulation_seed[session_id] = next_seed
    updated_snapshot = simulate_session(snapshot, next_seed)
    session_store[session_id] = updated_snapshot
    return deepcopy(updated_snapshot)


@app.get("/api/anchors")
def list_anchors() -> list[SpatialAnchor]:
    return [
        deepcopy(anchor)
        for anchor in sorted(
            anchor_store.values(),
            key=lambda anchor: anchor.updatedAt,
            reverse=True,
        )
    ]


@app.post("/api/anchors")
def create_anchor(payload: CreateSpatialAnchorRequest) -> SpatialAnchor:
    timestamp = utc_now_iso()
    anchor = SpatialAnchor(
        anchorId=f"anchor-{uuid4().hex[:10]}",
        label=payload.label.strip(),
        mapId=ANCHOR_MAP_ID,
        note=payload.note.strip(),
        createdAt=timestamp,
        updatedAt=timestamp,
        globalPose=payload.globalPose,
        localHint=payload.localHint,
    )
    anchor_store[anchor.anchorId] = anchor
    return deepcopy(anchor)


@app.get("/api/anchors/{anchor_id}")
def get_anchor(anchor_id: str) -> SpatialAnchor:
    return deepcopy(get_anchor_or_404(anchor_id))


@app.post("/api/anchors/{anchor_id}/guidance")
def get_anchor_guidance(
    anchor_id: str,
    payload: AnchorGuidanceRequest,
) -> AnchorGuidanceResponse:
    anchor = get_anchor_or_404(anchor_id)
    guidance = build_anchor_guidance(anchor, payload.currentPose)
    return deepcopy(guidance)


# --- Watch Telemetry Ingestion API ---

@app.websocket("/api/sessions/{session_id}/stream")
async def websocket_stream(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"Watch telemetry client connected to session: {session_id}")
    try:
        while True:
            # We receive both text (JSON) and bytes (Audio) from the watch
            message = await websocket.receive()
            if "text" in message:
                try:
                    payload = json.loads(message["text"])
                    logger.info(f"Received raw telemetry: {payload}")
                    if session_id in session_store:
                        snapshot = session_store[session_id]
                        timestamp = utc_now_iso()
                        
                        # Apply live biometrics from watch
                        snapshot.biometrics.heartRate = payload.get("heartRate", snapshot.biometrics.heartRate)
                        snapshot.biometrics.oxygen = payload.get("oxygenSaturation", snapshot.biometrics.oxygen)
                        snapshot.biometrics.skinTempC = round(payload.get("skinTemperature", snapshot.biometrics.skinTempC), 1)
                        snapshot.biometrics.lastUpdated = timestamp
                        
                        # Apply live compass heading
                        heading = payload.get("heading")
                        if heading is not None:
                            snapshot.guidance.headingDegrees = int(round(heading)) % 360
                            
                except Exception as e:
                    logger.error(f"Failed to parse telemetry JSON: {e}")
            elif "bytes" in message:
                # Discard audio binary frames for now to prevent flooding the backend processing
                pass

    except WebSocketDisconnect:
        logger.info("Watch telemetry client disconnected.")
    except Exception as e:
        logger.error(f"WebSocket stream error: {e}")
