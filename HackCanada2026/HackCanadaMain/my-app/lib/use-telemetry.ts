"use client";

import type { TelemetryData } from "@/lib/telemetry-types";
import { useEffect, useState } from "react";

const TELEMETRY_POLL_INTERVAL_MS = 2_000;

export function useTelemetry(sessionId: string | null) {
    const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);

    useEffect(() => {
        if (!sessionId) {
            setTelemetry(null);
            return;
        }

        const abortController = new AbortController();
        let pollTimeoutId: number;

        const fetchTelemetry = async () => {
            try {
                const response = await fetch(
                    `http://localhost:8000/api/sessions/${sessionId}/telemetry`,
                    { signal: abortController.signal },
                );

                if (response.ok) {
                    const data = (await response.json()) as TelemetryData;
                    setTelemetry(data);
                }
            } catch (error) {
                if (!abortController.signal.aborted) {
                    console.error("Failed to fetch telemetry:", error);
                }
            } finally {
                if (!abortController.signal.aborted) {
                    pollTimeoutId = window.setTimeout(
                        fetchTelemetry,
                        TELEMETRY_POLL_INTERVAL_MS,
                    );
                }
            }
        };

        void fetchTelemetry();

        return () => {
            abortController.abort();
            window.clearTimeout(pollTimeoutId);
        };
    }, [sessionId]);

    return telemetry;
}
