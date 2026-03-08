import type { RefObject } from "react";
import styles from "@/components/firesight-view.module.css";
import { ViewMode } from "@/lib/firesight-publisher-ui";

interface FireSightViewProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  modelStatus: string;
  navStatus?: string;
  systemStatus: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  currentViewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
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
  currentViewMode,
  onViewModeChange,
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

        <div className={styles.modePanel}>
          <button
            className={`${styles.modeBtn} ${currentViewMode === ViewMode.REGULAR ? styles.modeBtnActive : ""}`}
            onClick={() => onViewModeChange(ViewMode.REGULAR)}
          >
            REGULAR
          </button>
          <button
            className={`${styles.modeBtn} ${currentViewMode === ViewMode.CONTOUR ? styles.modeBtnActive : ""}`}
            onClick={() => onViewModeChange(ViewMode.CONTOUR)}
          >
            CONTOUR
          </button>
          <button
            className={`${styles.modeBtn} ${currentViewMode === ViewMode.THERMAL ? styles.modeBtnActive : ""}`}
            onClick={() => onViewModeChange(ViewMode.THERMAL)}
          >
            THERMAL
          </button>
        </div>

        <div className={styles.bottom}>
          <span className={`${styles.status} ${styles.statusOk}`}>{navStatus}</span>
        </div>
      </div>
    </main>
  );
}
