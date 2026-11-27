import { Link2, Search, UserRoundPlus, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { partnerFamiliesOf } from '../model/graph';
import { addRelative, canLink, parentPlan, RelationError, type Relation } from '../model/ops';
import { displayName, fullName, newEvent, normalize, yearsLabel } from '../model/people';
import type { ChildKind, LifeEvent, Sex } from '../model/types';
import { useStore } from '../store/store';
import { useFocusTrap } from '../ui/Dialog';
import { Avatar, DateField, SexToggle, TextField } from '../ui/fields';

const TITLES: Record<Relation, string> = { parent: 'Add a parent', child: 'Add a child', spouse: 'Add a partner', sibling: 'Add a sibling' };

export function AddPersonForm() {
  const form = useStore((s) => s.addForm)!;
  const tree = useStore((s) => s.tree)!;
  const { setAddForm, commit, toast, select } = useStore.getState();
  const anchor = tree.people[form.anchorId];
  const plan = useMemo(() => (form.rel === 'parent' ? parentPlan(tree, form.anchorId) : null), [tree, form]);
  const fams = useMemo(() => partnerFamiliesOf(tree, form.anchorId), [tree, form.anchorId]);

  const defaultSex: Sex =
    form.rel === 'parent' ? plan!.defaultSex : form.rel === 'spouse' ? (anchor.sex === 'male' ? 'female' : anchor.sex === 'female' ? 'male' : 'unknown') : 'unknown';

  const surnameFor = (sex: Sex): string => {
    if (form.rel === 'sibling') return anchor.birthSurname || anchor.surname;
    if (form.rel === 'parent') return sex === 'male' ? anchor.birthSurname || anchor.surname : '';
    if (form.rel === 'child') {
      if (anchor.sex === 'male') return anchor.surname;
      const fam = fams[fams.length - 1];
      const other = fam?.partners.map((p) => tree.people[p]).find((p) => p && p.id !== anchor.id);
      return other?.sex === 'male' ? other.surname : anchor.surname;
    }
    return '';
  };

  const [given, setGiven] = useState('');
  const [sex, setSex] = useState<Sex>(defaultSex);
  const [surname, setSurname] = useState(surnameFor(defaultSex));
  const [surnameTouched, setSurnameTouched] = useState(false);
  const [born, setBorn] = useState('');
  const [died, setDied] = useState('');
  const [occupation, setOccupation] = useState('');
  const [familyId, setFamilyId] = useState(fams[fams.length - 1]?.id ?? '');
  const [parentKind, setParentKind] = useState<ChildKind>('step');
  const [mode, setMode] = useState<'new' | 'link'>('new');
  const [query, setQuery] = useState('');

  const ref = useRef<HTMLFormElement>(null);
  useFocusTrap(ref, true, () => setAddForm(null));

  const relWord = form.rel === 'spouse' ? 'partner' : form.rel;
  const finish = (res: ReturnType<typeof addRelative>, name: string) => {
    toast({ message: res.note ? `Added ${name}. ${res.note}` : `Added ${name} as ${relWord} of ${displayName(anchor)}`, undo: true, kind: 'success', timeout: res.note ? 9000 : undefined });
    setAddForm(null);
    select(res.personId);
  };

  const save = (asUnknown = false) => {
    try {
      const events: LifeEvent[] = [];
      if (!asUnknown && born.trim()) events.push(newEvent({ type: 'birth', date: born.trim() }));
      if (!asUnknown && died.trim()) events.push(newEvent({ type: 'death', date: died.trim() }));
      const person = asUnknown
        ? { placeholder: true, given: '', surname: surname.trim(), sex }
        : {
            given: given.trim(),
            surname: surname.trim(),
            sex,
            events,
            occupation: occupation.trim() || undefined,
            living: died.trim() ? ('deceased' as const) : ('auto' as const),
          };
      const name = asUnknown ? 'an unknown person' : fullName({ ...anchor, ...person, placeholder: false }) || 'someone';
      const res = commit(`Added ${name} as ${relWord} of ${fullName(anchor)}`, (d) =>
        addRelative(d, form.anchorId, form.rel, person, { familyId: familyId || undefined, parentKind }),
      );
      finish(res, name);
    } catch (e) {
      toast({ message: e instanceof RelationError ? e.message : 'Could not add this person.', kind: 'error' });
    }
  };

  const link = (id: string) => {
    try {
      const other = tree.people[id];
      const res = commit(`Linked ${fullName(other)} as ${relWord} of ${fullName(anchor)}`, (d) =>
        addRelative(d, form.anchorId, form.rel, id, { familyId: familyId || undefined, parentKind }),
      );
      finish(res, fullName(other));
    } catch (e) {
      toast({ message: e instanceof RelationError ? e.message : 'Could not link this person.', kind: 'error' });
    }
  };

  const candidates = useMemo(() => {
    if (mode !== 'link') return [];
    const q = normalize(query);
    return Object.values(tree.people)
      .filter((p) => p.id !== anchor.id && !canLink(tree, anchor.id, form.rel, p.id))
      .filter((p) => !q || normalize(`${p.given} ${p.surname} ${p.birthSurname ?? ''} ${p.otherNames.join(' ')}`).includes(q))
      .slice(0, 30);
  }, [mode, query, tree, anchor.id, form.rel]);

  // positioning
  const isSmall = window.innerWidth < 640;
  const W = 360;
  const style: React.CSSProperties = isSmall
    ? { left: 0, right: 0, bottom: 0 }
    : {
        left: Math.max(8, Math.min(window.innerWidth - W - 8, form.x - W / 2)),
        top: Math.max(64, Math.min(window.innerHeight - 560, form.y + 28)),
        width: W,
      };

  return (
    <>
      {isSmall && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setAddForm(null)} />}
      <form
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`${TITLES[form.rel]} for ${displayName(anchor)}`}
        className={`fixed z-50 bg-surface shadow-lift border border-line animate-pop ${isSmall ? 'rounded-t-xl max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]' : 'rounded-xl'}`}
        style={style}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid="add-form"
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div>
            <h2 className="font-semibold">{TITLES[form.rel]}</h2>
            <p className="text-xs text-muted">for {displayName(anchor)}</p>
          </div>
          <button type="button" className="icon-btn -mr-2" onClick={() => setAddForm(null)} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {mode === 'new' ? (
          <div className="px-4 pb-4 space-y-3">
            {plan?.mode === 'extra-parent' && (
              <div className="rounded bg-subtle p-2.5 text-xs text-muted">
                Two birth parents are already recorded. This person will be added as
                <select className="ml-1 bg-transparent font-medium text-ink underline" value={parentKind} onChange={(e) => setParentKind(e.target.value as ChildKind)} aria-label="Parent type">
                  <option value="step">a step parent</option>
                  <option value="adopted">an adoptive parent</option>
                  <option value="foster">a foster parent</option>
                </select>
                .
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <TextField label="First name(s)" value={given} onChange={setGiven} autoFocus testId="add-given" />
              <TextField
                label="Surname"
                value={surname}
                onChange={(v) => {
                  setSurname(v);
                  setSurnameTouched(true);
                }}
                testId="add-surname"
              />
            </div>
            <SexToggle
              value={sex}
              onChange={(s) => {
                setSex(s);
                if (!surnameTouched) setSurname(surnameFor(s));
              }}
            />
            {form.rel === 'parent' && plan?.mode !== 'extra-parent' && (
              <p className="text-xs text-muted -mt-1">Adding a {sex === 'female' ? 'mother' : sex === 'male' ? 'father' : 'parent'}.</p>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <DateField label="Born" value={born} onChange={setBorn} testId="add-born" />
              <DateField label="Died" value={died} onChange={setDied} />
            </div>
            <TextField label="Occupation / known for" value={occupation} onChange={setOccupation} />
            {form.rel === 'child' && fams.length > 1 && (
              <div>
                <label className="label" htmlFor="add-with">
                  Other parent
                </label>
                <select id="add-with" className="input" value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
                  {fams.map((f) => {
                    const other = f.partners.find((p) => p !== anchor.id);
                    return (
                      <option key={f.id} value={f.id}>
                        {other && tree.people[other] ? fullName(tree.people[other]) : 'Unknown / not recorded'}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            <button type="submit" className="btn-primary w-full" data-testid="add-save">
              <UserRoundPlus size={17} /> Add {given.trim() || relWord}
            </button>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1 text-xs" onClick={() => save(true)}>
                Add as unknown
              </button>
              <button type="button" className="btn-ghost flex-1 text-xs" onClick={() => setMode('link')}>
                <Link2 size={14} /> Link an existing person
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input className="input pl-9" placeholder="Search people in this tree" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus aria-label="Search people" />
            </div>
            <ul className="max-h-72 overflow-y-auto -mx-1" role="listbox" aria-label="People">
              {candidates.map((p) => (
                <li key={p.id}>
                  <button type="button" role="option" aria-selected={false} className="w-full flex items-center gap-3 px-2 py-2 rounded hover:bg-subtle text-left" onClick={() => link(p.id)}>
                    <Avatar person={p} size={32} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">{displayName(p)}</span>
                      <span className="block text-xs text-muted">{yearsLabel(p) || '—'}</span>
                    </span>
                  </button>
                </li>
              ))}
              {!candidates.length && <li className="text-sm text-muted p-2">No one matches.</li>}
            </ul>
            <button type="button" className="btn-ghost w-full" onClick={() => setMode('new')}>
              Back to new person
            </button>
          </div>
        )}
      </form>
    </>
  );
}
