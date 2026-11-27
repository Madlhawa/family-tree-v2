import { AlertTriangle, CheckCircle2, Users, XOctagon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { findDuplicates, runChecks } from '../model/checks';
import { mergePeople, type MergeChoice } from '../model/ops';
import { birthOf, deathOf, displayName, fullName, yearsLabel } from '../model/people';
import type { Person } from '../model/types';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';
import { Avatar } from '../ui/fields';

export function ChecksDialog() {
  const tree = useStore((s) => s.tree)!;
  const { setDialog, focus, openProfile } = useStore.getState();
  const [tab, setTab] = useState<'dates' | 'dupes'>('dates');
  const issues = useMemo(() => runChecks(tree), [tree]);
  const dupes = useMemo(() => findDuplicates(tree), [tree]);
  return (
    <Dialog title="Data checks" description="Things that look unlikely or duplicated. Nothing is changed unless you choose to." onClose={() => setDialog(null)} size="lg">
      <div className="px-5 pt-3">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'dates'} onClick={() => setTab('dates')}>
            Dates & links ({issues.length})
          </button>
          <button role="tab" aria-selected={tab === 'dupes'} onClick={() => setTab('dupes')}>
            Possible duplicates ({dupes.length})
          </button>
        </div>
      </div>
      <div className="p-5">
        {tab === 'dates' &&
          (issues.length === 0 ? (
            <Empty text="No problems found. Nice work!" />
          ) : (
            <ul className="divide-y divide-line">
              {issues.map((i, n) => {
                const p = tree.people[i.personId];
                return (
                  <li key={n} className="flex items-center gap-3 py-2.5">
                    {i.level === 'error' ? <XOctagon size={18} className="text-danger shrink-0" /> : <AlertTriangle size={18} className="text-warn shrink-0" />}
                    <Avatar person={p} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{displayName(p)}</div>
                      <div className="text-xs text-muted">{i.message}</div>
                    </div>
                    <button
                      className="btn-ghost h-8 text-xs"
                      onClick={() => {
                        setDialog(null);
                        focus(p.id);
                        openProfile(p.id, 'about');
                      }}
                    >
                      Review
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
        {tab === 'dupes' &&
          (dupes.length === 0 ? (
            <Empty text="No likely duplicates." />
          ) : (
            <ul className="space-y-2">
              {dupes.map((d) => (
                <li key={d.a + d.b} className="card p-3 flex flex-wrap items-center gap-3">
                  <Users size={18} className="text-muted" />
                  <span className="text-sm">
                    <strong>{fullName(tree.people[d.a])}</strong> ({yearsLabel(tree.people[d.a]) || '—'}) and <strong>{fullName(tree.people[d.b])}</strong> (
                    {yearsLabel(tree.people[d.b]) || '—'})
                  </span>
                  <span className="text-xs text-muted">{d.reasons.join(' · ')}</span>
                  <button className="btn-secondary h-8 text-xs ml-auto" onClick={() => setDialog({ type: 'merge', a: d.a, b: d.b })}>
                    Compare & merge
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </Dialog>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-muted">
      <CheckCircle2 size={32} className="text-ok" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

const FIELDS: { key: keyof MergeChoice & keyof Person; label: string; show: (p: Person) => string }[] = [
  { key: 'given', label: 'First name(s)', show: (p) => p.given },
  { key: 'surname', label: 'Surname', show: (p) => p.surname },
  { key: 'birthSurname', label: 'Maiden / birth surname', show: (p) => p.birthSurname ?? '' },
  { key: 'sex', label: 'Sex', show: (p) => (p.sex === 'unknown' ? '' : p.sex) },
  { key: 'occupation', label: 'Occupation', show: (p) => p.occupation ?? '' },
  { key: 'title', label: 'Title', show: (p) => p.title ?? '' },
  { key: 'bio', label: 'Bio', show: (p) => (p.bio ? p.bio.slice(0, 80) + (p.bio.length > 80 ? '…' : '') : '') },
  { key: 'photo', label: 'Photo', show: (p) => (p.photo ? 'photo' : '') },
];

export function MergeDialog({ a, b }: { a: string; b: string }) {
  const tree = useStore((s) => s.tree)!;
  const { setDialog, commit, toast, focus } = useStore.getState();
  const A = tree.people[a];
  const B = tree.people[b];
  const [choice, setChoice] = useState<MergeChoice>(() => {
    const c: MergeChoice = {};
    for (const f of FIELDS) c[f.key] = !f.show(A) && f.show(B) ? 'drop' : 'keep';
    return c;
  });
  if (!A || !B) return null;
  const doMerge = () => {
    commit(`Merged ${fullName(B)} into ${fullName(A)}`, (d) => mergePeople(d, a, b, choice));
    toast({ message: `Merged into ${fullName(A)}`, undo: true, kind: 'success' });
    setDialog(null);
    focus(a);
  };
  const col = (p: Person, side: 'keep' | 'drop') => (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <Avatar person={p} size={40} />
        <div>
          <div className="font-semibold">{fullName(p)}</div>
          <div className="text-xs text-muted">
            {[birthOf(p)?.date, deathOf(p)?.date].filter(Boolean).join(' – ') || 'no dates'} · {p.events.length} events · {p.media.length} files
          </div>
        </div>
      </div>
      {FIELDS.map((f) => {
        const v = f.show(p);
        const selected = (choice[f.key] ?? 'keep') === side;
        return (
          <label key={f.key} className={`flex items-start gap-2 rounded px-2 py-1.5 text-sm cursor-pointer ${selected ? 'bg-accent/10' : 'hover:bg-subtle'} ${!v ? 'opacity-50' : ''}`}>
            <input type="radio" name={f.key} checked={selected} onChange={() => setChoice((c) => ({ ...c, [f.key]: side }))} className="mt-1 accent-[rgb(var(--accent))]" />
            <span>
              <span className="block text-xs text-muted">{f.label}</span>
              {v || '—'}
            </span>
          </label>
        );
      })}
    </div>
  );
  return (
    <Dialog
      title="Merge two records"
      description="Pick which value to keep for each field. Events, photos, links and family connections from both are kept."
      onClose={() => setDialog({ type: 'checks' })}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={() => setDialog({ type: 'checks' })}>
            Back
          </button>
          <button className="btn-primary" onClick={doMerge} data-testid="merge-confirm">
            Merge records
          </button>
        </>
      }
    >
      <div className="p-5 grid sm:grid-cols-2 gap-6">
        {col(A, 'keep')}
        {col(B, 'drop')}
      </div>
    </Dialog>
  );
}
