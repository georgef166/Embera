import type { Guidance } from "@/lib/types";

interface CompassGuidanceProps {
  guidance: Guidance;
}

const directionRotation: Record<Guidance["safeDirection"], string> = {
  LEFT: "-35deg",
  FORWARD: "0deg",
  RIGHT: "35deg",
};

export function CompassGuidance({ guidance }: CompassGuidanceProps) {
  return (
    <div className="rounded-[2rem] border border-cyan-500/20 bg-slate-950/80 p-6 shadow-[0_0_50px_rgba(14,165,233,0.12)] backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Forward Guidance</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{guidance.cueLabel}</h2>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Confidence</p>
          <p className="mt-1 text-xl font-semibold text-white">{Math.round(guidance.confidence * 100)}%</p>
        </div>
      </div>

      <div className="relative mx-auto mt-8 flex h-56 w-56 items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.2),rgba(15,23,42,0.92)_60%)]">
        <div className="absolute inset-5 rounded-full border border-dashed border-white/10" />
        <div className="absolute top-4 text-xs uppercase tracking-[0.4em] text-slate-400">N</div>
        <div className="absolute bottom-4 text-xs uppercase tracking-[0.4em] text-slate-500">S</div>
        <div className="absolute left-4 text-xs uppercase tracking-[0.4em] text-slate-500">W</div>
        <div className="absolute right-4 text-xs uppercase tracking-[0.4em] text-slate-500">E</div>
        <div
          className="absolute h-24 w-3 origin-bottom rounded-full bg-gradient-to-t from-cyan-500 to-emerald-300 shadow-[0_0_25px_rgba(34,211,238,0.7)]"
          style={{ transform: `translateY(-18px) rotate(${directionRotation[guidance.safeDirection]})` }}
        />
        <div className="absolute flex h-20 w-20 items-center justify-center rounded-full border border-white/15 bg-slate-950/95 text-center shadow-xl">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Safe</p>
            <p className="mt-1 text-lg font-semibold text-white">{guidance.safeDirection}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Why</p>
          <p className="mt-1 text-sm text-slate-200">{guidance.reason}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Heading</p>
          <p className="mt-1 text-lg font-semibold text-white">{guidance.headingDegrees}°</p>
        </div>
      </div>
    </div>
  );
}
