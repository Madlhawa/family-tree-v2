import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { displayName, normalize, yearsLabel } from '../model/people';
import type { Person, TreeData } from '../model/types';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';
import { Avatar } from '../ui/fields';

export function searchPeople(tree: TreeData, query: string, limit = 50): { person: Person; why?: string }[] {
  const q = normalize(query);
  const all = Object.values(tree.people).filter((p) => !p.placeholder || p.given);
  if (!q) return all.slice(0, limit).map((person) => ({ person }));
  const words = q.split(' ');
  const out: { person: Person; why?: string; score: number }[] = [];
  for (const p of all) {
    const name = normalize(`${p.given} ${p.surname} ${p.birthSurname ?? ''}`);
    const other = normalize(p.otherNames.join(' '));
    const occ = normalize(p.occupation ?? '');
    const places = normalize(p.events.map((e) => e.place ?? '').join(' '));
    const hay = `${name} ${other} ${occ} ${places}`;
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    let why: string | undefined;
    if (words.every((w) => name.includes(w))) score = name.startsWith(q) ? 3 : 2;
    else if (words.every((w) => other.includes(w) || name.includes(w))) {
      score = 1.5;
      why = `Also known as ${p.otherNames.join(', ')}`;
    } else if (words.some((w) => occ.includes(w))) {
      score = 1;
      why = p.occupation;
    } else {
      score = 0.5;
      why = p.events.map((e) => e.place).find((pl) => pl && words.some((w) => normalize(pl).includes(w)));
    }
    out.push({ person: p, why, score });
  }
  return out.sort((a, b) => b.score - a.score || displayName(a.person).localeCompare(displayName(b.person))).slice(0, limit);
}

export function SearchDialog() {
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const { setDialog, focus } = useStore.getState();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchPeople(tree, q), [tree, q]);
  const go = (id: string) => {
    setDialog(null);
    focus(id);
  };
  return (
    <Dialog title="Search" onClose={() => setDialog(null)} size="md">
      <div className="p-4 pb-2 sticky top-0 bg-surface">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input pl-10 h-12 text-base"
            placeholder="Name, nickname, occupation or place"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && results[active]) go(results[active].person.id);
            }}
            data-autofocus
            aria-label="Search people"
            aria-controls="search-results"
            aria-activedescendant={results[active] ? `sr-${results[active].person.id}` : undefined}
            data-testid="search-input"
          />
        </div>
      </div>
      <ul id="search-results" role="listbox" className="px-2 pb-3">
        {results.map(({ person, why }, i) => (
          <li key={person.id} id={`sr-${person.id}`} role="option" aria-selected={i === active}>
            <button
              className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left ${i === active ? 'bg-subtle' : 'hover:bg-subtle'}`}
              onClick={() => go(person.id)}
              onMouseEnter={() => setActive(i)}
            >
              <Avatar person={person} size={36} privacy={publicView} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium truncate">{displayName(person, { privacy: publicView })}</span>
                <span className="block text-xs text-muted truncate">{[yearsLabel(person, { privacy: publicView }), why].filter(Boolean).join(' · ') || '—'}</span>
              </span>
            </button>
          </li>
        ))}
        {!results.length && <li className="p-4 text-sm text-muted text-center">Nobody found for “{q}”.</li>}
      </ul>
    </Dialog>
  );
}
