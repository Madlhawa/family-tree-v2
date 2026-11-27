import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { Issue } from '../../model/checks';
import { parseDate } from '../../model/dates';
import { childrenOf, parentsOf, partnersOf, siblingsOf } from '../../model/graph';
import { updatePerson } from '../../model/ops';
import { birthOf, deathOf, fullName, isLiving, newEvent } from '../../model/people';
import type { LivingStatus, Person, Sex } from '../../model/types';
import { commitWithToast, useStore } from '../../store/store';
import { DateField, PersonChip, SexToggle, TextField } from '../../ui/fields';
import { safeUrl, socialUrl } from '../../util/urls';

export function AboutTab({ person, editing, setEditing, issues }: { person: Person; editing: boolean; setEditing: (v: boolean) => void; issues: Issue[] }) {
  if (editing) return <EditForm person={person} onDone={() => setEditing(false)} />;
  return <AboutView person={person} issues={issues} />;
}

function Fact({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-32 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function AboutView({ person, issues }: { person: Person; issues: Issue[] }) {
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const openProfile = useStore((s) => s.openProfile);
  const hidden = publicView && isLiving(person);
  const b = birthOf(person);
  const d = deathOf(person);
  const when = (raw?: string, place?: string) => {
    if (!raw && !place) return undefined;
    const p = parseDate(raw);
    return [raw ? (p.valid ? p.display : raw) : '', place].filter(Boolean).join(' · ');
  };
  const parents = parentsOf(tree, person.id);
  const partners = partnersOf(tree, person.id);
  const kids = childrenOf(tree, person.id);
  const sibs = siblingsOf(tree, person.id);
  const chipRow = (label: string, items: { p: Person; sub?: string }[]) =>
    items.length ? (
      <div>
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{label}</h4>
        <div className="flex flex-wrap gap-1.5">
          {items.map(({ p, sub }) => (
            <PersonChip key={p.id + (sub ?? '')} person={p} privacy={publicView} sub={sub} onClick={() => openProfile(p.id)} />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      {issues.length > 0 && !publicView && (
        <ul className="rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm space-y-1">
          {issues.map((i, n) => (
            <li key={n} className="flex gap-2">
              <span className="mt-1.5 w-2 h-2 rounded-full bg-warn shrink-0" />
              {i.message}
            </li>
          ))}
        </ul>
      )}
      {hidden ? (
        <p className="text-sm text-muted">Details of living people are hidden in public view.</p>
      ) : (
        <>
          <dl>
            <Fact label="Born" value={when(b?.date, b?.place)} />
            <Fact label="Died" value={when(d?.date, d?.place) ?? (person.living === 'deceased' ? 'Deceased' : undefined)} />
            <Fact label="Maiden / birth surname" value={person.birthSurname} />
            <Fact label="Also known as" value={person.otherNames.join(', ')} />
            <Fact label="Title" value={person.title} />
            <Fact label="Occupation / known for" value={person.occupation} />
            <Fact label="Sex" value={person.sex === 'unknown' ? undefined : person.sex[0].toUpperCase() + person.sex.slice(1)} />
          </dl>
          {person.bio ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{person.bio}</p>
          ) : (
            <p className="text-sm text-muted">No story written yet. Use “Edit details” to add a short bio.</p>
          )}
        </>
      )}
      <div className="space-y-3">
        {chipRow(
          'Parents',
          parents.map((x) => ({ p: x.person, sub: x.kind !== 'birth' ? x.kind : undefined })),
        )}
        {chipRow(
          'Partners',
          partners.map((x) => ({ p: x.person, sub: x.family.status !== 'married' && x.family.status !== 'unknown' ? x.family.status : undefined })),
        )}
        {chipRow(
          'Children',
          kids.map((x) => ({ p: x.person, sub: x.kind !== 'birth' ? x.kind : undefined })),
        )}
        {chipRow(
          'Siblings',
          sibs.map((x) => ({ p: x.person, sub: x.step ? 'step' : x.half ? 'half' : undefined })),
        )}
      </div>
      {!hidden && (person.links.length > 0 || person.socials.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {person.links.map((l) => {
            const u = safeUrl(l.url);
            return u ? (
              <a key={l.id} href={u} target="_blank" rel="noopener noreferrer nofollow" className="chip hover:bg-subtle">
                <ExternalLink size={12} /> {l.label || new URL(u).hostname}
              </a>
            ) : null;
          })}
          {person.socials.map((s) => {
            const u = socialUrl(s.platform, s.handle);
            return u ? (
              <a key={s.id} href={u} target="_blank" rel="noopener noreferrer nofollow" className="chip hover:bg-subtle">
                <ExternalLink size={12} /> {s.platform}: {s.handle}
              </a>
            ) : null;
          })}
        </div>
      )}
      {tree.people[person.id] && <p className="text-xs text-muted">Last updated {new Date(person.updatedAt).toLocaleString()}</p>}
    </div>
  );
}

function EditForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const b = birthOf(person);
  const d = deathOf(person);
  const [f, setF] = useState({
    given: person.given,
    surname: person.surname,
    birthSurname: person.birthSurname ?? '',
    otherNames: person.otherNames.join(', '),
    title: person.title ?? '',
    sex: person.sex as Sex,
    living: person.living as LivingStatus,
    occupation: person.occupation ?? '',
    born: b?.date ?? '',
    bornPlace: b?.place ?? '',
    died: d?.type === 'death' ? d.date ?? '' : '',
    diedPlace: d?.type === 'death' ? d.place ?? '' : '',
    bio: person.bio ?? '',
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const save = () => {
    commitWithToast(
      `Edited ${fullName({ ...person, given: f.given, surname: f.surname })}`,
      (draft) => {
        const p = draft.people[person.id];
        updatePerson(draft, person.id, {
          given: f.given.trim(),
          surname: f.surname.trim(),
          birthSurname: f.birthSurname.trim() || undefined,
          otherNames: f.otherNames
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          title: f.title.trim() || undefined,
          sex: f.sex,
          living: f.living,
          occupation: f.occupation.trim() || undefined,
          bio: f.bio.trim() || undefined,
        });
        const upsert = (type: 'birth' | 'death', date: string, place: string) => {
          const ev = p.events.find((e) => e.type === type && !e.disputed) ?? p.events.find((e) => e.type === type);
          if (ev) {
            ev.date = date.trim() || undefined;
            ev.place = place.trim() || undefined;
            if (!ev.date && !ev.place && !ev.note && !ev.source) p.events = p.events.filter((e) => e !== ev);
          } else if (date.trim() || place.trim()) {
            p.events.push(newEvent({ type, date: date.trim() || undefined, place: place.trim() || undefined }));
          }
        };
        upsert('birth', f.born, f.bornPlace);
        upsert('death', f.died, f.diedPlace);
        if (!p.given && !p.surname && person.placeholder) p.placeholder = true;
      },
      'Changes saved',
    );
    onDone();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      data-testid="edit-form"
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <TextField label="First name(s)" value={f.given} onChange={set('given')} autoFocus testId="edit-given" />
        <TextField label="Surname" value={f.surname} onChange={set('surname')} testId="edit-surname" />
        <TextField label="Maiden / birth surname" value={f.birthSurname} onChange={set('birthSurname')} />
        <TextField label="Other names / nickname (comma separated)" value={f.otherNames} onChange={set('otherNames')} />
        <TextField label="Title (optional)" value={f.title} onChange={set('title')} placeholder="e.g. Dr, Sir, Rev." />
        <TextField label="Occupation / known for" value={f.occupation} onChange={set('occupation')} />
      </div>
      <div>
        <span className="label">Sex</span>
        <SexToggle value={f.sex} onChange={set('sex')} includeOther />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <DateField label="Born" value={f.born} onChange={set('born')} />
        <TextField label="Birthplace" value={f.bornPlace} onChange={set('bornPlace')} />
        <DateField label="Died" value={f.died} onChange={set('died')} />
        <TextField label="Place of death" value={f.diedPlace} onChange={set('diedPlace')} />
      </div>
      <div>
        <span className="label">Living status</span>
        <div className="seg" role="radiogroup" aria-label="Living status">
          {(
            [
              ['auto', 'Work it out from dates'],
              ['living', 'Living'],
              ['deceased', 'Deceased'],
            ] as const
          ).map(([v, l]) => (
            <button type="button" key={v} role="radio" aria-checked={f.living === v} aria-pressed={f.living === v} onClick={() => set('living')(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="bio">
          Short bio
        </label>
        <textarea id="bio" className="textarea" rows={5} value={f.bio} onChange={(e) => set('bio')(e.target.value)} placeholder="A few lines about their life, character or stories people tell." />
      </div>
      <div className="flex gap-2 justify-end sticky bottom-0 bg-surface py-2">
        <button type="button" className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" data-testid="edit-save">
          Save
        </button>
      </div>
    </form>
  );
}
