"use client";

import type { TelemetryData } from "@/lib/telemetry-types";

export function WatchTelemetryOverlay({
    telemetry,
}: {
    telemetry: TelemetryData | null;
}) {
    if (!telemetry) {
        return null;
    }

    const { heartRate, oxygen, skinTempC } = telemetry.biometrics;
    const { headingDegrees } = telemetry.guidance;

    return (
        <div className="absolute right-[30px] top-[290px] z-50 flex flex-col gap-3 w-48 bg-[rgba(0,0,0,0.52)] border border-[#00ff85] p-5 text-[#00ff85] shadow-[0_0_0_1px_rgba(0,0,0,0.4),inset_0_0_18px_rgba(0,0,0,0.28)] backdrop-blur-[2px]">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#00ff85] border-b border-[#00ff85]/30 pb-2 mb-1 [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">
                FIRESIGHT VITALS
            </h3>

            <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#00ff85]/70 [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">Pulse (HR)</span>
                <div className="flex items-end gap-1 text-[#00ff85]">
                    <span className="text-3xl font-mono font-bold leading-none [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">{heartRate}</span>
                    <span className="text-[10px] mb-1 font-mono uppercase tracking-widest [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">bpm</span>
                </div>
            </div>

            <div className="flex flex-col gap-0.5 mt-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#00ff85]/70 [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">Oxygen (SpO2)</span>
                <div className="flex items-end gap-1 text-[#00ff85]">
                    <span className="text-3xl font-mono font-bold leading-none [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">{oxygen.toFixed(1)}</span>
                    <span className="text-[10px] mb-1 font-mono uppercase tracking-widest [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">%</span>
                </div>
            </div>

            <div className="flex flex-col gap-0.5 mt-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#00ff85]/70 [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">Skin Temp</span>
                <div className="flex items-end gap-1 text-[#00ff85]">
                    <span className="text-3xl font-mono font-bold leading-none [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">{skinTempC.toFixed(1)}</span>
                    <span className="text-[10px] mb-1 font-mono uppercase tracking-widest [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">°C</span>
                </div>
            </div>

            <div className="mt-2 flex flex-col gap-0.5 border-t border-[#00ff85]/30 pt-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#00ff85]/70 [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">Heading (Azimuth)</span>
                <div className="flex items-end gap-1 text-[#00ff85]">
                    <span className="text-3xl font-mono font-bold leading-none [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">{headingDegrees}</span>
                    <span className="text-[10px] mb-1 font-mono uppercase tracking-widest [text-shadow:0_0_6px_rgba(0,255,133,0.35)]">°</span>
                </div>
            </div>
        </div>
    );
}
