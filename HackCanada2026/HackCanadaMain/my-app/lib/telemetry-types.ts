export interface Biometrics {
    heartRate: number;
    oxygen: number;
    stressIndex: number;
    skinTempC: number;
    battery: number;
    lastUpdated: string;
}

export interface Guidance {
    safeDirection: "LEFT" | "FORWARD" | "RIGHT";
    headingDegrees: number;
    confidence: number;
    cueLabel: string;
    riskLevel: "critical" | "high" | "medium" | "low";
    reason: string;
}

export interface TelemetryData {
    sessionId: string;
    streamHealth: number;
    status: "active" | "monitoring" | "degraded";
    biometrics: Biometrics;
    guidance: Guidance;
}
