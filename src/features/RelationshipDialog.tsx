import { ArrowLeftRight, Route } from 'lucide-react';
import { useMemo, useState } from 'react';
import { displayName } from '../model/people';
import { relationship } from '../model/relationship';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';
import { Avatar } from '../ui/fields';
import { PersonPicker } from './PersonPicker';

export function RelationshipDialog({ a: a0, b: b0 }: { a?: string; b?: string }) {
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const { setDialog, setHighlight, fitView, setView, view } = useStore.getState();
  const [a, setA] = useState(a0 ?? useStore.getState().selectedId ?? tree.homeId);
  const [b, setB] = useState(b0);
  const rel = useMemo(() => (a && b ? relationship(tree, a, b) : null), [tree, a, b]);

  const show = () => {
    if (!rel) return;
    setHighlight(rel.path);
    if (view === 'fan') setView('family');
    setDialog(null);
    useStore.getState().toast({ message: 'Path highlighted. Press Esc to clear.', action: { label: 'Clear', run: () => setHighlight([]) } });
    setTimeout(fitView, 50);
  };

  return (
    <Dialog
      title="Relationship finder"
      description="Pick two people to see how they are related."
      onClose={() => setDialog(null)}
      footer={
        <>
          <button className="btn-secondary" onClick={() => setDialog(null)}>
            Close
          </button>
          <button className="btn-primary" disabled={!rel || rel.path.length < 2} onClick={show}>
            <Route size={16} /> Show path on tree
          </button>
        </>
      }
    >
      <div className="p-5 space-y-5">
        <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <PersonPicker label="Person" value={a} onChange={setA} />
          <button
            className="icon-btn mb-0.5 mx-auto"
            aria-label="Swap"
            onClick={() => {
              setA(b);
              setB(a);
            }}
          >
            <ArrowLeftRight size={18} />
          </button>
          <PersonPicker label="Relative" value={b} onChange={setB} exclude={a} />
        </div>
        {rel && (
          <div className="rounded-lg bg-subtle p-4" aria-live="polite" data-testid="relationship-result">
            <p className="text-xs uppercase tracking-wide text-muted font-semibold">Result</p>
            <p className="text-xl font-semibold mt-1 first-letter:uppercase">{rel.kind === 'none' ? 'Not related' : rel.term}</p>
            <p className="text-sm text-muted mt-1">{publicView ? '' : rel.sentence}</p>
            {rel.path.length > 1 && (
              <ol className="flex flex-wrap items-center gap-1.5 mt-3" aria-label="Connecting path">
                {rel.path.map((id, i) => (
                  <li key={id} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted">→</span>}
                    <span className="chip">
                      <Avatar person={tree.people[id]} size={18} privacy={publicView} />
                      {displayName(tree.people[id], { privacy: publicView })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
