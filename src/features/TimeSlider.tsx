import { X } from 'lucide-react';
import { useMemo } from 'react';
import { aliveInYear, yearRange } from '../model/stats';
import { useStore } from '../store/store';

export function TimeSlider() {
  const tree = useStore((s) => s.tree)!;
  const year = useStore((s) => s.timeYear)!;
  const setTimeYear = useStore((s) => s.setTimeYear);
  const [min, max] = useMemo(() => yearRange(tree), [tree]);
  const alive = useMemo(() => Object.values(tree.people).filter((p) => aliveInYear(p, year)).length, [tree, year]);
  return (
    <div className="absolute z-20 top-3 left-1/2 -translate-x-1/2 card shadow-lift px-4 py-3 w-[min(100%-24px,520px)] no-print" data-ui onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3">
        <label htmlFor="year" className="text-sm font-medium whitespace-nowrap">
          Who was alive in <span className="tabular-nums text-accent text-base font-bold">{year}</span>?
        </label>
        <span className="text-xs text-muted ml-auto whitespace-nowrap">{alive} people</span>
        <button className="icon-btn h-8 w-8" onClick={() => setTimeYear(null)} aria-label="Close time slider">
          <X size={16} />
        </button>
      </div>
      <input id="year" type="range" min={min} max={max} value={year} onChange={(e) => setTimeYear(+e.target.value)} className="w-full mt-2 accent-[rgb(var(--accent))]" />
      <div className="flex justify-between text-[11px] text-muted tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
