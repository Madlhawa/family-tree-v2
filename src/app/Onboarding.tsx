import { Sparkles, Upload, UserRound } from 'lucide-react';
import { useState } from 'react';
import { addPerson } from '../model/ops';
import { newEvent } from '../model/people';
import type { Sex } from '../model/types';
import { useStore } from '../store/store';
import { DateField, SexToggle, TextField } from '../ui/fields';

export function Onboarding() {
  const tree = useStore((s) => s.tree);
  const { createTree, commit, setDialog, focus } = useStore.getState();
  const [given, setGiven] = useState('');
  const [surname, setSurname] = useState('');
  const [sex, setSex] = useState<Sex>('unknown');
  const [born, setBorn] = useState('');

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!given.trim() && !surname.trim()) return;
    if (!useStore.getState().tree) await createTree(surname.trim() ? `${surname.trim()} family` : 'My family');
    const id = commit(`Added ${given} ${surname}`.trim(), (d) => {
      const p = addPerson(d, {
        given: given.trim(),
        surname: surname.trim(),
        sex,
        living: 'living',
        events: born.trim() ? [newEvent({ type: 'birth', date: born.trim() })] : [],
      });
      d.homeId = p.id;
      if (d.name === 'My family' && surname.trim()) d.name = `${surname.trim()} family`;
      return p.id;
    });
    focus(id, { fly: false });
    useStore.setState({ selectedId: id });
  };

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <UserRound size={30} className="text-accent" />
            </div>
            <h1 className="text-2xl font-bold">Start with yourself</h1>
            <p className="text-muted mt-1">Add yourself first. Then we’ll add your parents, partner and children — one click each.</p>
          </div>
          <form className="card p-5 space-y-4" onSubmit={start} data-testid="onboarding">
            <div className="grid grid-cols-2 gap-3">
              <TextField label="First name" value={given} onChange={setGiven} autoFocus testId="onb-given" />
              <TextField label="Surname" value={surname} onChange={setSurname} testId="onb-surname" />
            </div>
            <div>
              <span className="label">Sex</span>
              <SexToggle value={sex} onChange={setSex} />
            </div>
            <DateField label="Born (optional)" value={born} onChange={setBorn} />
            <button className="btn-primary w-full h-11" type="submit" disabled={!given.trim() && !surname.trim()} data-testid="onb-start">
              Start my tree
            </button>
            <p className="text-xs text-muted text-center">Everything is saved privately on this device. No account needed.</p>
          </form>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button className="btn-ghost" onClick={() => void createTree('Carter family (demo)', { demo: true })} data-testid="onb-demo">
              <Sparkles size={16} /> Explore a demo tree
            </button>
            <button className="btn-ghost" onClick={() => setDialog({ type: 'importexport', tab: 'import' })}>
              <Upload size={16} /> Import GEDCOM or backup
            </button>
          </div>
          {tree && <p className="text-xs text-muted text-center mt-2">This tree (“{tree.name}”) is empty.</p>}
        </div>
      </div>
    </div>
  );
}

/** Gentle next steps shown while the tree is still tiny. */
export function NextSteps() {
  const tree = useStore((s) => s.tree)!;
  const home = tree.homeId ? tree.people[tree.homeId] : undefined;
  const addForm = useStore((s) => s.addForm);
  const [hidden, setHidden] = useState(false);
  const count = Object.keys(tree.people).length;
  if (!home || count > 4 || hidden || addForm) return null;
  const open = (rel: 'parent' | 'spouse' | 'child') => {
    const el = document.querySelector(`[data-person="${home.id}"]`)?.getBoundingClientRect();
    useStore.getState().setAddForm({ anchorId: home.id, rel, x: el ? el.left + el.width / 2 : window.innerWidth / 2, y: el ? el.bottom : 200 });
  };
  return (
    <div className="absolute z-10 top-3 left-1/2 -translate-x-1/2 card shadow-lift p-4 w-[min(100%-24px,440px)] no-print animate-pop" data-ui onPointerDown={(e) => e.stopPropagation()}>
      <p className="font-semibold">{count === 1 ? 'Great start! Who’s next?' : 'Keep going'}</p>
      <p className="text-sm text-muted mt-0.5">Hover over (or tap) a card to see the + buttons. Or start here:</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn-primary h-9" onClick={() => open('parent')} data-testid="next-parent">
          Add a parent
        </button>
        <button className="btn-secondary h-9" onClick={() => open('spouse')}>
          Add a partner
        </button>
        <button className="btn-secondary h-9" onClick={() => open('child')}>
          Add a child
        </button>
        <button className="btn-ghost h-9 ml-auto" onClick={() => setHidden(true)}>
          Hide
        </button>
      </div>
    </div>
  );
}
