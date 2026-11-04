import { useEffect, useState, type ReactNode } from "react";

const COUNT_MS = 800;

function shouldAnimate(): boolean {
  return typeof window.matchMedia === "function" && document.visibilityState === "visible" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useCountUp(target: number): number {
  const [value, setValue] = useState(() => (shouldAnimate() ? 0 : target));

  useEffect(() => {
    if (!shouldAnimate()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / COUNT_MS, 1);
      setValue(Math.round(target * (1 - 2 ** (-10 * progress))));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setValue(target);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

/** One column of the dashboard's ledger band; designed to sit on the navy panel. */
export function StatCard({ label, value, hint }: { label: string; value: number; hint?: ReactNode }) {
  const shown = useCountUp(value);
  return (
    <div className="px-6 py-5 sm:px-8">
      <p className="text-sm text-navy-200">{label}</p>
      <p className="mt-1 font-serif text-4xl font-semibold text-white tabular-nums sm:text-[42px] sm:leading-none">{shown}</p>
      {hint && <div className="mt-2 text-xs text-navy-300">{hint}</div>}
    </div>
  );
}
