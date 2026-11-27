import { AlertTriangle, Baby, BookOpen, Briefcase, Church, Cross, Flag, GraduationCap, Heart, Home, MapPin, Pencil, Plane, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { parseDate } from '../../model/dates';
import { partnerFamiliesOf } from '../../model/graph';
import { fullName, isLiving, newEvent } from '../../model/people';
import { EVENT_TYPES, type Confidence, type EventType, type LifeEvent, type Person } from '../../model/types';
import { commitWithToast, useStore } from '../../store/store';
import { DateField, TextField } from '../../ui/fields';

export const EVENT_LABEL: Record<EventType, string> = {
  birth: 'Birth',
  death: 'Death',
  marriage: 'Marriage',
  baptism: 'Baptism / christening',
  burial: 'Burial',
  residence: 'Lived in',
  education: 'Education',
  occupation: 'Occupation',
  military: 'Military service',
  migration: 'Moved / migrated',
  custom: 'Other event',
};

const ICON: Record<EventType, typeof Baby> = {
  birth: Baby,
  death: Cross,
  marriage: Heart,
  baptism: Church,
  burial: Flag,
  residence: Home,
  education: GraduationCap,
  occupation: Briefcase,
  military: Star,
  migration: Plane,
  custom: BookOpen,
};

export const CONFIDENCE: Record<Confidence, { label: string; cls: string }> = {
  confirmed: { label: 'Confirmed', cls: 'bg-ok/10 text-ok border-ok/30' },
  probable: { label: 'Probable', cls: 'bg-warn/10 text-warn border-warn/30' },
  story: { label: 'Family story', cls: 'bg-accent/10 text-accent border-accent/30' },
};

export function TimelineTab({ person }: { person: Person }) {
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  if (publicView && isLiving(person)) return <p className="text-sm text-muted">Hidden in public view.</p>;

  const marriages = partnerFamiliesOf(tree, person.id)
    .filter((f) => f.date || f.place)
    .map((f) => {
      const other = f.partners.find((p) => p !== person.id);
      return { id: 'fam-' + f.id, date: f.date, place: f.place, label: `Married ${other && tree.people[other] ? fullName(tree.people[other]) : ''}` };
    });
  const items = [
    ...person.events.map((e) => ({ kind: 'event' as const, e, key: parseDate(e.date).sortKey ?? Infinity })),
    ...marriages.map((m) => ({ kind: 'fam' as const, m, key: parseDate(m.date).sortKey ?? Infinity })),
  ].sort((a, b) => a.key - b.key);
  const disputedTypes = new Set(person.events.filter((e) => e.disputed).map((e) => e.type));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-secondary h-9" onClick={() => setEditing('new')} data-testid="add-event">
          <Plus size={15} /> Add event
        </button>
      </div>
      {editing === 'new' && <EventForm person={person} onDone={() => setEditing(null)} />}
      {items.length === 0 && editing !== 'new' && <p className="text-sm text-muted">No events yet.</p>}
      <ol className="relative border-l-2 border-line ml-3 space-y-4">
        {items.map((it) => {
          if (it.kind === 'fam') {
            return (
              <li key={it.m.id} className="ml-5">
                <span className="absolute -left-[13px] w-6 h-6 rounded-full bg-surface border-2 border-line flex items-center justify-center">
                  <Heart size={12} className="text-muted" />
                </span>
                <div className="text-sm font-semibold">{it.m.label}</div>
                <div className="text-xs text-muted">{[parseDate(it.m.date).display || it.m.date, it.m.place].filter(Boolean).join(' · ')}</div>
              </li>
            );
          }
          const e = it.e;
          if (editing === e.id)
            return (
              <li key={e.id} className="ml-5">
                <EventForm person={person} event={e} onDone={() => setEditing(null)} />
              </li>
            );
          const Icon = ICON[e.type];
          const pd = parseDate(e.date);
          return (
            <li key={e.id} className="ml-5 group">
              <span className="absolute -left-[13px] w-6 h-6 rounded-full bg-surface border-2 border-line flex items-center justify-center">
                <Icon size={12} className="text-muted" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{e.type === 'custom' || e.type === 'occupation' || e.type === 'education' || e.type === 'military' ? e.label || EVENT_LABEL[e.type] : EVENT_LABEL[e.type]}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${CONFIDENCE[e.confidence].cls}`}>{CONFIDENCE[e.confidence].label}</span>
                {(e.disputed || disputedTypes.has(e.type)) && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full border border-danger/30 text-danger bg-danger/5 inline-flex items-center gap-1">
                    <AlertTriangle size={11} /> {e.disputed ? 'Disputed record' : 'Conflicting records'}
                  </span>
                )}
                <span className="ml-auto flex opacity-70 group-hover:opacity-100">
                  <button className="icon-btn h-8 w-8" aria-label="Edit event" onClick={() => setEditing(e.id)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-btn h-8 w-8"
                    aria-label="Delete event"
                    onClick={() =>
                      commitWithToast('Deleted an event', (d) => {
                        const p = d.people[person.id];
                        p.events = p.events.filter((x) => x.id !== e.id);
                      }, 'Event deleted')
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              <div className="text-xs text-muted flex flex-wrap gap-x-3">
                {e.date && <span className={pd.valid ? '' : 'text-warn'}>{pd.valid ? pd.display : `${e.date} (unreadable date)`}</span>}
                {e.place && (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin size={11} /> {e.place}
                  </span>
                )}
              </div>
              {e.note && <p className="text-sm mt-1 whitespace-pre-wrap">{e.note}</p>}
              {e.source && <p className="text-xs text-muted mt-0.5">Source: {e.source}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function EventForm({ person, event, onDone }: { person: Person; event?: LifeEvent; onDone: () => void }) {
  const [f, setF] = useState<LifeEvent>(event ?? newEvent({ type: 'residence' }));
  const set = <K extends keyof LifeEvent>(k: K) => (v: LifeEvent[K]) => setF((c) => ({ ...c, [k]: v }));
  const save = () => {
    commitWithToast(event ? 'Edited an event' : 'Added an event', (d) => {
      const p = d.people[person.id];
      const clean = { ...f, label: f.label?.trim() || undefined, date: f.date?.trim() || undefined, place: f.place?.trim() || undefined, note: f.note?.trim() || undefined, source: f.source?.trim() || undefined };
      if (event) p.events = p.events.map((x) => (x.id === event.id ? clean : x));
      else p.events.push(clean);
      // a second record of a vital event is a conflict: mark it disputed unless the user chose otherwise
      if (!event && (clean.type === 'birth' || clean.type === 'death') && p.events.filter((x) => x.type === clean.type).length > 1) {
        const added = p.events[p.events.length - 1];
        added.disputed = true;
      }
      p.updatedAt = Date.now();
    }, 'Event saved');
    onDone();
  };
  return (
    <form
      className="card p-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="ev-type">
            Type
          </label>
          <select id="ev-type" className="input" value={f.type} onChange={(e) => set('type')(e.target.value as EventType)} data-autofocus>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <TextField label={f.type === 'custom' ? 'What happened' : 'Description (optional)'} value={f.label ?? ''} onChange={set('label')} />
        <DateField label="Date" value={f.date ?? ''} onChange={set('date')} />
        <TextField label="Place" value={f.place ?? ''} onChange={set('place')} />
      </div>
      <div>
        <label className="label" htmlFor="ev-note">
          Note
        </label>
        <textarea id="ev-note" className="textarea" rows={2} value={f.note ?? ''} onChange={(e) => set('note')(e.target.value)} />
      </div>
      <TextField label="Source (e.g. 1911 census, birth certificate)" value={f.source ?? ''} onChange={set('source')} />
      <div className="flex flex-wrap items-center gap-3">
        <span className="label mb-0">How sure are you?</span>
        <div className="seg" role="radiogroup" aria-label="Confidence">
          {(Object.keys(CONFIDENCE) as Confidence[]).map((c) => (
            <button type="button" key={c} role="radio" aria-checked={f.confidence === c} aria-pressed={f.confidence === c} onClick={() => set('confidence')(c)}>
              {CONFIDENCE[c].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!f.disputed} onChange={(e) => set('disputed')(e.target.checked || undefined)} className="w-4 h-4 accent-[rgb(var(--accent))]" />
          Disputed record
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Save event
        </button>
      </div>
    </form>
  );
}
