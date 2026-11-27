import { Printer, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseDate } from '../model/dates';
import { childrenOf, parentsOf, partnerFamiliesOf } from '../model/graph';
import { birthOf, deathOf, fullName, isLiving, yearsLabel } from '../model/people';
import type { Person, TreeData } from '../model/types';
import { useStore } from '../store/store';

function generations(tree: TreeData, rootId: string, dir: 'ancestors' | 'descendants', max: number): string[][] {
  const out: string[][] = [[rootId]];
  const seen = new Set([rootId]);
  for (let g = 1; g < max; g++) {
    const next: string[] = [];
    for (const id of out[g - 1]) {
      const rel = dir === 'ancestors' ? parentsOf(tree, id).map((p) => p.person) : childrenOf(tree, id).map((c) => c.person);
      for (const p of rel) if (!seen.has(p.id) && !p.placeholder) (seen.add(p.id), next.push(p.id));
    }
    if (!next.length) break;
    out.push(next);
  }
  return out;
}

function genTitle(dir: 'ancestors' | 'descendants', g: number) {
  if (g === 0) return 'Starting person';
  if (dir === 'ancestors') return g === 1 ? 'Parents' : g === 2 ? 'Grandparents' : `${g === 3 ? '' : g - 2 + '× '}Great-grandparents`;
  return g === 1 ? 'Children' : g === 2 ? 'Grandchildren' : `${g === 3 ? '' : g - 2 + '× '}Great-grandchildren`;
}

export function ReportView() {
  const tree = useStore((s) => s.tree)!;
  const focusId = useStore((s) => s.focusId) ?? tree.homeId!;
  const setDialog = useStore((s) => s.setDialog);
  const [dir, setDir] = useState<'ancestors' | 'descendants'>('descendants');
  const [hideLiving, setHideLiving] = useState(true);
  const [max, setMax] = useState(5);
  const gens = useMemo(() => generations(tree, focusId, dir, max), [tree, focusId, dir, max]);
  const root = tree.people[focusId];
  const hidden = (p: Person) => hideLiving && isLiving(p);
  const nameOf = (p: Person) => (hidden(p) ? 'Living person' : fullName(p));
  const fact = (raw?: string, place?: string) => [raw && (parseDate(raw).valid ? parseDate(raw).display : raw), place].filter(Boolean).join(', ');

  return createPortal(
    <div id="print-root" className="fixed inset-0 z-50 bg-white text-black overflow-y-auto">
      <div className="no-print sticky top-0 bg-surface text-ink border-b border-line px-4 py-2 flex flex-wrap items-center gap-3">
        <strong className="mr-2">Printable report</strong>
        <div className="seg">
          <button aria-pressed={dir === 'descendants'} onClick={() => setDir('descendants')}>
            Descendants
          </button>
          <button aria-pressed={dir === 'ancestors'} onClick={() => setDir('ancestors')}>
            Ancestors
          </button>
        </div>
        <label className="text-sm flex items-center gap-2">
          Generations
          <select className="input h-9 w-auto" value={max} onChange={(e) => setMax(+e.target.value)}>
            {[2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={hideLiving} onChange={(e) => setHideLiving(e.target.checked)} className="w-4 h-4" /> Hide living people
        </label>
        <span className="flex-1" />
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print or save as PDF
        </button>
        <button className="icon-btn" onClick={() => setDialog(null)} aria-label="Close report">
          <X size={20} />
        </button>
      </div>
      <article className="max-w-3xl mx-auto px-8 py-10 font-serif" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold">{tree.name}</h1>
          <p className="mt-2 text-gray-600">
            {dir === 'descendants' ? 'Descendants' : 'Ancestors'} of {nameOf(root)} · prepared {new Date().toLocaleDateString()}
          </p>
        </header>
        {gens.map((ids, g) => (
          <section key={g} className={g > 0 ? 'print-page-break pt-6' : ''}>
            <h2 className="text-xl font-bold border-b border-gray-300 pb-1 mb-4">
              Generation {g + 1}: {genTitle(dir, g)}
            </h2>
            {ids.map((id) => {
              const p = tree.people[id];
              const b = birthOf(p);
              const d = deathOf(p);
              return (
                <div key={id} className="mb-6 break-inside-avoid">
                  <h3 className="text-lg font-semibold">
                    {nameOf(p)} {!hidden(p) && <span className="font-normal text-gray-600">{yearsLabel(p)}</span>}
                  </h3>
                  {!hidden(p) && (
                    <div className="text-sm leading-relaxed">
                      {b && fact(b.date, b.place) && <p>Born: {fact(b.date, b.place)}</p>}
                      {d && fact(d.date, d.place) && <p>Died: {fact(d.date, d.place)}</p>}
                      {p.occupation && <p>Occupation: {p.occupation}</p>}
                      {p.bio && <p className="mt-1 italic">{p.bio}</p>}
                    </div>
                  )}
                  {partnerFamiliesOf(tree, id).map((f) => {
                    const other = f.partners.find((x) => x !== id);
                    const op = other ? tree.people[other] : undefined;
                    const kids = f.children.map((c) => tree.people[c.id]).filter(Boolean);
                    return (
                      <div key={f.id} className="mt-2 pl-4 border-l-2 border-gray-200 text-sm">
                        <p>
                          {f.status === 'partners' ? 'Partner' : 'Married'}: {op ? nameOf(op) : 'unknown'}
                          {!hidden(p) && (!op || !hidden(op)) && fact(f.date, f.place) ? ` (${fact(f.date, f.place)})` : ''}
                        </p>
                        {kids.length > 0 && (
                          <p className="text-gray-700">
                            Children: {kids.map((k) => nameOf(k) + (hidden(k) ? '' : ` ${yearsLabel(k)}`)).join('; ')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        ))}
      </article>
    </div>,
    document.body,
  );
}
