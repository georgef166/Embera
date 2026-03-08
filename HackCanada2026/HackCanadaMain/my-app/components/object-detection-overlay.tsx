import type { Detection } from "@/lib/types";

interface ObjectDetectionOverlayProps {
  detections: Detection[];
}

const priorityClasses: Record<Detection["priority"], string> = {
  critical: "border-rose-400 bg-rose-500/10 text-rose-200",
  high: "border-amber-300 bg-amber-500/10 text-amber-100",
  medium: "border-cyan-300 bg-cyan-500/10 text-cyan-100",
  low: "border-white/40 bg-slate-900/35 text-slate-100",
};

export function ObjectDetectionOverlay({ detections }: ObjectDetectionOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {detections.map((detection) => (
        <div
          key={detection.id}
          className={`absolute rounded-2xl border-2 shadow-[0_0_20px_rgba(15,23,42,0.45)] ${priorityClasses[detection.priority]}`}
          style={{
            left: `${detection.x}%`,
            top: `${detection.y}%`,
            width: `${detection.width}%`,
            height: `${detection.height}%`,
          }}
        >
          <div className="m-2 inline-flex max-w-[80%] flex-col rounded-xl bg-slate-950/80 px-3 py-2 backdrop-blur">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              {detection.category}
            </span>
            <span className="mt-1 text-sm font-semibold">{detection.label}</span>
            <span className="mt-1 text-xs text-slate-300">{detection.description}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
