import type { RefObject } from "react";
import styles from "@/components/firesight-view.module.css";

interface FireSightViewProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  modelStatus: string;
  navStatus?: string;
  systemStatus: string;
  videoRef: RefObject<HTMLVideoElement | null>;
}

function resolveStatusClass(status: string) {
  if (status.includes("FAIL") || status.includes("ERROR")) {
    return styles.statusError;
  }

  if (
    status.includes("LOAD") ||
    status.includes("WAIT") ||
    status.includes("BOOT") ||
    status.includes("STANDBY")
  ) {
    return styles.statusWarn;
  }

  return styles.statusOk;
}

export function FireSightView({
  canvasRef,
  modelStatus,
  navStatus = "NAV: EXIT TRACKING",
  systemStatus,
  videoRef,
}: FireSightViewProps) {
  return (
    <main className={styles.shell}>
      <video
        ref={videoRef}
        aria-hidden="true"
        autoPlay
        className={styles.video}
        muted
        playsInline
      />
      <canvas ref={canvasRef} aria-hidden="true" className={styles.canvas} />

      <div className={styles.hud}>
        <div className={`${styles.corner} ${styles.topLeft}`} />
        <div className={`${styles.corner} ${styles.topRight}`} />
        <div className={`${styles.corner} ${styles.bottomLeft}`} />
        <div className={`${styles.corner} ${styles.bottomRight}`} />

        <div className={styles.top}>
          <span className={`${styles.status} ${resolveStatusClass(systemStatus)}`}>
            {systemStatus}
          </span>
          <span className={`${styles.status} ${resolveStatusClass(modelStatus)}`}>
            {modelStatus}
          </span>
        </div>

        <div className={styles.bottom}>
          <span className={`${styles.status} ${styles.statusOk}`}>{navStatus}</span>
        </div>
      </div>
    </main>
  );
}
