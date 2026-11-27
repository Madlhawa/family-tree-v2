import { useMemo, useState } from 'react';
import { primaryParentFamily } from '../model/graph';
import { displayName, surnameHue, yearsLabel } from '../model/people';
import type { TreeData } from '../model/types';
import { useStore } from '../store/store';

const GENS = 6;
const SPAN = (240 * Math.PI) / 180; // fan opening
const R0 = 90;
const RING = [0, 110, 100, 95, 90, 85, 80];

function ancestorsBySlot(tree: TreeData, focusId: string) {
  // Ahnentafel numbering: 1 = focus, 2n = father, 2n+1 = mother
  const slots = new Map<number, string>([[1, focusId]]);
  for (let n = 1; n < 2 ** (GENS + 1); n++) {
    const id = slots.get(n);
    if (!id) continue;
    const fam = primaryParentFamily(tree, id);
    if (!fam) continue;
    const ps = fam.partners.map((p) => tree.people[p]).filter(Boolean);
    const rank = (sex: string) => (sex === 'male' ? 0 : sex === 'female' ? 2 : 1);
    const sorted = [...ps].sort((a, b) => rank(a.sex) - rank(b.sex));
    const father = sorted.length === 2 || sorted[0]?.sex !== 'female' ? sorted[0] : undefined;
    const mother = sorted.length === 2 ? sorted[1] : sorted[0]?.sex === 'female' ? sorted[0] : undefined;
    if (father && 2 * n < 2 ** (GENS + 1)) slots.set(2 * n, father.id);
    if (mother && 2 * n + 1 < 2 ** (GENS + 1)) slots.set(2 * n + 1, mother.id);
  }
  return slots;
}

function arc(r1: number, r2: number, a1: number, a2: number) {
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M ${p(r1, a1)} L ${p(r2, a1)} A ${r2} ${r2} 0 ${large} 1 ${p(r2, a2)} L ${p(r1, a2)} A ${r1} ${r1} 0 ${large} 0 ${p(r1, a1)} Z`;
}

export function FanChart() {
  const tree = useStore((s) => s.tree)!;
  const focusId = useStore((s) => s.focusId)!;
  const publicView = useStore((s) => s.publicView);
  const { focus, openProfile } = useStore.getState();
  const [hover, setHover] = useState<string | null>(null);
  const slots = useMemo(() => ancestorsBySlot(tree, focusId), [tree, focusId]);
  const radii: number[] = [0, R0];
  for (let g = 1; g <= GENS; g++) radii.push(radii[g] + RING[g]);
  const outer = radii[GENS + 1];
  const start = -Math.PI / 2 - SPAN / 2;

  const cells: JSX.Element[] = [];
  for (let g = 1; g <= GENS; g++) {
    const count = 2 ** g;
    const step = SPAN / count;
    for (let i = 0; i < count; i++) {
      const slot = count + i;
      const id = slots.get(slot);
      if (!slots.has(slot >> 1)) continue; // only one empty ring beyond known people
      const a1 = start + i * step;
      const a2 = a1 + step;
      const r1 = radii[g];
      const r2 = radii[g + 1];
      const p = id ? tree.people[id] : undefined;
      const hue = p ? surnameHue(p.birthSurname || p.surname) : 0;
      const mid = (a1 + a2) / 2;
      const rm = (r1 + r2) / 2;
      const deg = (mid * 180) / Math.PI;
      // Radial text in the outer rings, tangential in the inner ones
      const radial = g >= 4;
      const rot = radial ? (deg > 90 || deg < -90 ? deg + 180 : deg) : deg + 90;
      const flip = !radial && (deg > 0 && deg < 180);
      cells.push(
        <g
          key={slot}
          className={p ? 'cursor-pointer' : ''}
          onClick={() => p && focus(p.id)}
          onPointerEnter={() => p && setHover(p.id)}
          onPointerLeave={() => setHover(null)}
          role={p ? 'button' : undefined}
          aria-label={p ? `${displayName(p, { privacy: publicView })}, re-centre here` : undefined}
          tabIndex={p ? 0 : undefined}
          onKeyDown={(e) => p && e.key === 'Enter' && focus(p.id)}
        >
          <path
            d={arc(r1, r2, a1, a2)}
            fill={p ? `hsl(${hue} 55% ${hover === p.id ? 82 : 90}%)` : 'rgb(var(--subtle))'}
            stroke="rgb(var(--bg))"
            strokeWidth={2}
          />
          {p && (
            <g transform={`translate(${rm * Math.cos(mid)} ${rm * Math.sin(mid)}) rotate(${flip ? rot + 180 : rot})`}>
              <text textAnchor="middle" fontSize={g <= 2 ? 13 : g <= 3 ? 11 : 10} fontWeight={600} fill={`hsl(${hue} 40% 22%)`} dy={g <= 3 ? -2 : 3}>
                {truncate(g >= 4 ? displayName(p, { privacy: publicView }) : p.given || displayName(p, { privacy: publicView }), g <= 2 ? 22 : g <= 3 ? 14 : g === 4 ? 13 : 11)}
              </text>
              {g <= 3 && (
                <text textAnchor="middle" fontSize={10.5} fill={`hsl(${hue} 30% 32%)`} dy={12}>
                  {truncate(g <= 2 ? `${p.surname} ${yearsLabel(p, { privacy: publicView })}` : p.surname, 18)}
                </text>
              )}
            </g>
          )}
        </g>,
      );
    }
  }
  const me = tree.people[focusId];
  const size = outer * 2 + 40;
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4" data-testid="fan-chart">
      <svg viewBox={`${-outer - 20} ${-outer - 20} ${size} ${outer * (1 + Math.sin(SPAN / 2 - Math.PI / 2)) + 40}`} className="w-full h-full max-w-[1100px]" role="img" aria-label={`Fan chart of ${displayName(me)}'s ancestors`}>
        {cells}
        <g className="cursor-pointer" onClick={() => openProfile(focusId)} role="button" aria-label={`Open ${displayName(me)}'s profile`} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openProfile(focusId)}>
          <circle r={R0 - 4} fill="rgb(var(--accent))" />
          <text textAnchor="middle" fill="rgb(var(--accent-ink))" fontWeight={700} fontSize={15} dy={-4}>
            {truncate(displayName(me, { privacy: publicView }), 16)}
          </text>
          <text textAnchor="middle" fill="rgb(var(--accent-ink))" fontSize={12} dy={14} opacity={0.85}>
            {yearsLabel(me, { privacy: publicView })}
          </text>
        </g>
      </svg>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
