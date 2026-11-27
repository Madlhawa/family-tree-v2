import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { orderedChildren, parentFamiliesOf, partnerFamiliesOf, siblingsOf } from '../../model/graph';
import { moveChild, setChildKind, sortByBirth, unlinkChild, unlinkPartner, updateFamily } from '../../model/ops';
import { fullName } from '../../model/people';
import type { ChildKind, Family, FamilyStatus, Person } from '../../model/types';
import { commitWithToast, useStore, type AddFormState } from '../../store/store';
import { DateField, PersonChip, TextField } from '../../ui/fields';

const KINDS: ChildKind[] = ['birth', 'adopted', 'step', 'foster'];
const STATUSES: FamilyStatus[] = ['married', 'partners', 'divorced', 'widowed', 'unknown'];

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function FamilyTab({ person }: { person: Person }) {
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const { openProfile, closeProfile, setAddForm } = useStore.getState();
  const parentFams = parentFamiliesOf(tree, person.id);
  const partnerFams = partnerFamiliesOf(tree, person.id);
  const sibs = siblingsOf(tree, person.id);

  const add = (rel: AddFormState['rel']) => {
    closeProfile();
    setAddForm({ anchorId: person.id, rel, x: window.innerWidth / 2, y: window.innerHeight / 3 - 40 });
  };
  const addBtn = (rel: AddFormState['rel'], label: string) => (
    <button className="btn-ghost h-8 text-xs" onClick={() => add(rel)}>
      <Plus size={14} /> {label}
    </button>
  );
  const name = fullName(person);

  return (
    <div className="space-y-7">
      <Section title="Parents" action={addBtn('parent', 'Add parent')}>
        {parentFams.length === 0 && <p className="text-sm text-muted">No parents recorded.</p>}
        {parentFams.map(({ family, kind }) => (
          <div key={family.id} className="card p-3 flex flex-wrap items-center gap-2">
            {family.partners.map((pid) => tree.people[pid] && <PersonChip key={pid} person={tree.people[pid]} privacy={publicView} onClick={() => openProfile(pid)} />)}
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-xs text-muted" htmlFor={`k-${family.id}`}>
                {name} is their
              </label>
              <select
                id={`k-${family.id}`}
                className="input h-9 w-auto"
                value={kind}
                onChange={(e) => commitWithToast('Changed relationship type', (d) => setChildKind(d, family.id, person.id, e.target.value as ChildKind))}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k === 'birth' ? 'birth child' : `${k} child`}
                  </option>
                ))}
              </select>
              <button className="icon-btn" title="Unlink from these parents" aria-label="Unlink from these parents" onClick={() => commitWithToast(`Unlinked ${name} from parents`, (d) => unlinkChild(d, family.id, person.id), 'Unlinked')}>
                <Unlink size={16} />
              </button>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Partners & children" action={<div className="flex">{addBtn('spouse', 'Add partner')}{addBtn('child', 'Add child')}</div>}>
        {partnerFams.length === 0 && <p className="text-sm text-muted">No partners or children recorded.</p>}
        {partnerFams.map((f) => (
          <FamilyCard key={f.id} family={f} person={person} />
        ))}
      </Section>

      <Section title="Siblings" action={addBtn('sibling', 'Add sibling')}>
        {sibs.length === 0 ? (
          <p className="text-sm text-muted">No siblings recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sibs.map((s) => (
              <PersonChip key={s.person.id} person={s.person} privacy={publicView} sub={s.step ? 'step' : s.half ? 'half' : 'full'} onClick={() => openProfile(s.person.id)} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function FamilyCard({ family, person }: { family: Family; person: Person }) {
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const openProfile = useStore((s) => s.openProfile);
  const otherId = family.partners.find((p) => p !== person.id);
  const other = otherId ? tree.people[otherId] : undefined;
  const kids = orderedChildren(tree, family);
  const [date, setDate] = useState(family.date ?? '');
  const [place, setPlace] = useState(family.place ?? '');
  useEffect(() => {
    setDate(family.date ?? '');
    setPlace(family.place ?? '');
  }, [family.date, family.place]);
  const saveDatePlace = () => {
    if ((family.date ?? '') === date.trim() && (family.place ?? '') === place.trim()) return;
    commitWithToast('Updated family details', (d) => updateFamily(d, family.id, { date: date.trim() || undefined, place: place.trim() || undefined }), 'Saved');
  };

  return (
    <div className="card p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {other ? <PersonChip person={other} privacy={publicView} onClick={() => openProfile(other.id)} /> : <span className="text-sm text-muted">Other parent not recorded</span>}
        <select
          className="input h-9 w-auto"
          aria-label="Relationship status"
          value={family.status}
          onChange={(e) => commitWithToast('Changed family status', (d) => updateFamily(d, family.id, { status: e.target.value as FamilyStatus }), 'Saved')}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        {other && (
          <button
            className="icon-btn ml-auto"
            title="Unlink partner"
            aria-label="Unlink partner"
            onClick={() => commitWithToast(`Unlinked partner`, (d) => unlinkPartner(d, family.id, other.id), 'Partner unlinked')}
          >
            <Unlink size={16} />
          </button>
        )}
      </div>
      {other && (
        <div className="grid sm:grid-cols-2 gap-2" onBlur={saveDatePlace}>
          <DateField label={family.status === 'partners' ? 'Together since' : 'Marriage date'} value={date} onChange={setDate} />
          <TextField label="Place" value={place} onChange={setPlace} />
        </div>
      )}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">Children</span>
          {family.manualOrder && kids.length > 1 && (
            <button className="btn-ghost h-8 text-xs" onClick={() => commitWithToast('Sorted children by birth date', (d) => sortByBirth(d, family.id), 'Sorted by birth date')}>
              <ArrowUpDown size={14} /> Sort by birth date
            </button>
          )}
        </div>
        {kids.length === 0 && <p className="text-sm text-muted">No children.</p>}
        <ul className="space-y-1">
          {kids.map((c, i) => {
            const p = tree.people[c.id];
            if (!p) return null;
            return (
              <li key={c.id} className="flex items-center gap-2">
                <PersonChip person={p} privacy={publicView} onClick={() => openProfile(p.id)} />
                <select
                  className="input h-8 w-auto text-xs ml-auto"
                  aria-label={`Relationship of ${fullName(p)}`}
                  value={c.kind}
                  onChange={(e) => commitWithToast('Changed relationship type', (d) => setChildKind(d, family.id, c.id, e.target.value as ChildKind))}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <button className="icon-btn h-8 w-8" disabled={i === 0} aria-label="Move earlier" onClick={() => commitWithToast('Reordered children', (d) => moveChild(d, family.id, c.id, -1), 'Order saved')}>
                  <ArrowUp size={15} />
                </button>
                <button className="icon-btn h-8 w-8" disabled={i === kids.length - 1} aria-label="Move later" onClick={() => commitWithToast('Reordered children', (d) => moveChild(d, family.id, c.id, 1), 'Order saved')}>
                  <ArrowDown size={15} />
                </button>
                <button className="icon-btn h-8 w-8" aria-label={`Unlink ${fullName(p)}`} title="Unlink child" onClick={() => commitWithToast('Unlinked child', (d) => unlinkChild(d, family.id, c.id), 'Child unlinked')}>
                  <Unlink size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
