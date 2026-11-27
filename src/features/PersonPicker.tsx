import { useMemo, useState } from 'react';
import { displayName, yearsLabel } from '../model/people';
import { useStore } from '../store/store';
import { Avatar } from '../ui/fields';
import { searchPeople } from './SearchDialog';

export function PersonPicker({ label, value, onChange, exclude }: { label: string; value?: string; onChange: (id: string) => void; exclude?: string }) {
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchPeople(tree, q, 12).filter((r) => r.person.id !== exclude), [tree, q, exclude]);
  const current = value ? tree.people[value] : undefined;
  return (
    <div className="relative">
      <span className="label">{label}</span>
      {current && !open ? (
        <button className="input flex items-center gap-2 text-left" onClick={() => setOpen(true)}>
          <Avatar person={current} size={24} privacy={publicView} />
          <span className="truncate">{displayName(current, { privacy: publicView })}</span>
          <span className="ml-auto text-xs text-muted">Change</span>
        </button>
      ) : (
        <input
          className="input"
          placeholder="Type a name"
          value={q}
          autoFocus={open}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)}
          aria-label={label}
        />
      )}
      {open && (
        <ul className="absolute z-10 left-0 right-0 mt-1 card max-h-64 overflow-y-auto p-1" role="listbox">
          {results.map(({ person }) => (
            <li key={person.id}>
              <button
                role="option"
                aria-selected={person.id === value}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-subtle text-left"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(person.id);
                  setOpen(false);
                  setQ('');
                }}
              >
                <Avatar person={person} size={28} privacy={publicView} />
                <span className="text-sm truncate">{displayName(person, { privacy: publicView })}</span>
                <span className="text-xs text-muted ml-auto">{yearsLabel(person, { privacy: publicView })}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="p-2 text-sm text-muted">No matches</li>}
        </ul>
      )}
    </div>
  );
}
