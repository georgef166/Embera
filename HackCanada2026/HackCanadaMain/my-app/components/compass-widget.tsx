"use client";

import type { TelemetryData } from "@/lib/telemetry-types";

export function CompassWidget({
    telemetry,
}: {
    telemetry: TelemetryData | null;
}) {
    if (!telemetry) {
        return null;
    }

    const heading = telemetry.guidance.headingDegrees || 0;

    // Calculate a nice localized offset for a horizontal "tape" style compass,
    // or we can do a circular radar. Let's do a sleek horizontal tape compass
    // which is classic for HUDs. We shift a background or translate numbers.

    const width = 300; // pixels
    const degreesVisible = 90; // How many degrees to show on screen

    // Create an array of tick marks every 15 degrees
    const ticks = Array.from({ length: 72 }, (_, i) => i * 5);

    return (
        <div className="absolute bottom-[40px] left-1/2 z-50 -translate-x-1/2 flex flex-col items-center">
            {/* Target/Heading Readout */}
            <div className="mb-2 flex items-center gap-2 bg-[rgba(0,0,0,0.6)] border border-[#00ff85] px-3 py-1 shadow-[0_0_0_1px_rgba(0,0,0,0.4),inset_0_0_10px_rgba(0,0,0,0.5)] backdrop-blur-sm">
                <span className="text-[#00ff85] font-mono font-bold text-sm tracking-widest [text-shadow:0_0_6px_rgba(0,255,133,0.5)]">
                    TARGET HDR: {heading.toString().padStart(3, "0")}°
                </span>
            </div>

            {/* Compass Tape Window */}
            <div
                className="relative h-10 overflow-hidden bg-[rgba(0,0,0,0.4)] backdrop-blur-[2px] border-y border-[#00ff85]/50"
                style={{ width: `${width}px` }}
            >
                {/* Center Indicator (The reticle) */}
                <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-[#00ff85] -translate-x-1/2 z-10 shadow-[0_0_8px_rgba(0,255,133,1)]"></div>
                <div className="absolute left-1/2 top-0 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-[#00ff85] -translate-x-1/2 z-10"></div>

                {/* Moving Tape */}
                <div
                    className="absolute top-0 bottom-0 flex items-end transition-transform duration-100 ease-linear"
                    style={{
                        // 360 degrees covers the entire assumed scroll width. 
                        // We want the center of the tape to be aligned with the current heading.
                        // Let's use a simpler mapping. Each degree = certain px.
                        transform: `translateX(calc(${width / 2}px - ${(heading / degreesVisible) * width}px))`
                    }}
                >
                    {ticks.map(tick => {
                        // Label NSEW
                        let label = "";
                        let isMajor = false;
                        if (tick % 90 === 0) {
                            isMajor = true;
                            if (tick === 0 || tick === 360) label = "N";
                            else if (tick === 90) label = "E";
                            else if (tick === 180) label = "S";
                            else if (tick === 270) label = "W";
                        } else if (tick % 45 === 0) {
                            isMajor = true;
                            if (tick === 45) label = "NE";
                            else if (tick === 135) label = "SE";
                            else if (tick === 225) label = "SW";
                            else if (tick === 315) label = "NW";
                        } else if (tick % 15 === 0) {
                            label = tick.toString();
                        }

                        // A standard gap per degree
                        const pxPerDegree = width / degreesVisible;

                        return (
                            <div
                                key={tick}
                                className="absolute bottom-0 flex flex-col items-center justify-end"
                                style={{
                                    left: `${tick * pxPerDegree}px`,
                                    transform: 'translateX(-50%)'
                                }}
                            >
                                {label && (
                                    <span className={`font-mono text-[10px] mb-1 leading-none ${isMajor ? 'text-[#00ff85] font-bold [text-shadow:0_0_4px_rgba(0,255,133,0.5)]' : 'text-[#00ff85]/60'}`}>
                                        {label}
                                    </span>
                                )}
                                <div
                                    className={`bg-[#00ff85] ${isMajor ? 'w-[2px] h-3 shadow-[0_0_4px_rgba(0,255,133,0.5)]' : 'w-[1px] h-1.5 opacity-50'}`}
                                />
                            </div>
                        );
                    })}

                    {/* We duplicate the tape for seamless wrapping around 360 to 0. 
              But for a quick hack, we can just duplicate the ticks beyond 360 */}
                    {ticks.map(tick => {
                        const wrapTick = tick + 360;
                        let label = "";
                        let isMajor = false;
                        if (wrapTick % 90 === 0) {
                            isMajor = true;
                            if (wrapTick % 360 === 0) label = "N";
                            else if (wrapTick % 360 === 90) label = "E";
                            else if (wrapTick % 360 === 180) label = "S";
                            else if (wrapTick % 360 === 270) label = "W";
                        } else if (wrapTick % 45 === 0) {
                            isMajor = true;
                            if (wrapTick % 360 === 45) label = "NE";
                            else if (wrapTick % 360 === 135) label = "SE";
                            else if (wrapTick % 360 === 225) label = "SW";
                            else if (wrapTick % 360 === 315) label = "NW";
                        } else if (wrapTick % 15 === 0) {
                            label = (wrapTick % 360).toString();
                        }

                        const pxPerDegree = width / degreesVisible;

                        return (
                            <div
                                key={`wrap-${wrapTick}`}
                                className="absolute bottom-0 flex flex-col items-center justify-end"
                                style={{
                                    left: `${wrapTick * pxPerDegree}px`,
                                    transform: 'translateX(-50%)'
                                }}
                            >
                                {label && (
                                    <span className={`font-mono text-[10px] mb-1 leading-none ${isMajor ? 'text-[#00ff85] font-bold [text-shadow:0_0_4px_rgba(0,255,133,0.5)]' : 'text-[#00ff85]/60'}`}>
                                        {label}
                                    </span>
                                )}
                                <div
                                    className={`bg-[#00ff85] ${isMajor ? 'w-[2px] h-3 shadow-[0_0_4px_rgba(0,255,133,0.5)]' : 'w-[1px] h-1.5 opacity-50'}`}
                                />
                            </div>
                        );
                    })}

                    {/* Left wrap duplicate */}
                    {ticks.map(tick => {
                        const wrapTick = tick - 360;
                        let label = "";
                        let isMajor = false;
                        const posTick = (wrapTick + 720) % 360; // ensure positive modulo

                        if (posTick % 90 === 0) {
                            isMajor = true;
                            if (posTick === 0) label = "N";
                            else if (posTick === 90) label = "E";
                            else if (posTick === 180) label = "S";
                            else if (posTick === 270) label = "W";
                        } else if (posTick % 45 === 0) {
                            isMajor = true;
                            if (posTick === 45) label = "NE";
                            else if (posTick === 135) label = "SE";
                            else if (posTick === 225) label = "SW";
                            else if (posTick === 315) label = "NW";
                        } else if (posTick % 15 === 0) {
                            label = posTick.toString();
                        }

                        const pxPerDegree = width / degreesVisible;

                        return (
                            <div
                                key={`nwrap-${wrapTick}`}
                                className="absolute bottom-0 flex flex-col items-center justify-end"
                                style={{
                                    left: `${wrapTick * pxPerDegree}px`,
                                    transform: 'translateX(-50%)'
                                }}
                            >
                                {label && (
                                    <span className={`font-mono text-[10px] mb-1 leading-none ${isMajor ? 'text-[#00ff85] font-bold [text-shadow:0_0_4px_rgba(0,255,133,0.5)]' : 'text-[#00ff85]/60'}`}>
                                        {label}
                                    </span>
                                )}
                                <div
                                    className={`bg-[#00ff85] ${isMajor ? 'w-[2px] h-3 shadow-[0_0_4px_rgba(0,255,133,0.5)]' : 'w-[1px] h-1.5 opacity-50'}`}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Gradient fades on edges */}
                <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[rgba(0,0,0,0.8)] to-transparent z-10"></div>
                <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[rgba(0,0,0,0.8)] to-transparent z-10"></div>
            </div>
        </div>
    );
}
