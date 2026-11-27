import { Camera, Crosshair, GitCompareArrows, Home, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { checkPerson } from '../../model/checks';
import { deletePerson, updatePerson } from '../../model/ops';
import { displayName, fullName, isLiving, surnameHue, yearsLabel } from '../../model/people';
import { commitWithToast, useStore, type ProfileTab } from '../../store/store';
import { useFocusTrap } from '../../ui/Dialog';
import { Avatar, Silhouette } from '../../ui/fields';
import { resizeImage } from '../../util/files';
import { AboutTab } from './AboutTab';
import { FamilyTab } from './FamilyTab';
import { LinksTab } from './LinksTab';
import { MediaTab } from './MediaTab';
import { TimelineTab } from './TimelineTab';

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'about', label: 'About' },
  { id: 'family', label: 'Family' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'media', label: 'Photos & audio' },
  { id: 'links', label: 'Links & social' },
];

export function ProfileDialog() {
  const profile = useStore((s) => s.profile)!;
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const { closeProfile, openProfile, focus, setDialog, commit, toast } = useStore.getState();
  const person = tree.people[profile.id];
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const id = useId();
  useFocusTrap(ref, true, () => (editing ? setEditing(false) : closeProfile()));
  useEffect(() => setEditing(false), [profile.id]);
  if (!person) return null;
  const hue = surnameHue(person.birthSurname || person.surname);
  const hidden = publicView && isLiving(person);
  const issues = checkPerson(tree, person);

  const onPhoto = async (file?: File) => {
    if (!file) return;
    try {
      const data = await resizeImage(file, 512);
      commitWithToast(`Changed photo of ${fullName(person)}`, (d) => updatePerson(d, person.id, { photo: data }), 'Photo updated');
    } catch {
      toast({ message: 'That image could not be read.', kind: 'error' });
    }
  };

  const tabIndex = TABS.findIndex((t) => t.id === profile.tab);
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = TABS[(tabIndex + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    openProfile(person.id, next.id);
    requestAnimationFrame(() => document.getElementById(`${id}-tab-${next.id}`)?.focus());
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-6 no-print">
      <div className="absolute inset-0 bg-black/40" onClick={closeProfile} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-name`}
        className="relative w-full sm:max-w-3xl bg-surface sm:rounded-xl shadow-lift flex flex-col h-full sm:h-[min(88vh,860px)] animate-pop"
        data-testid="profile"
      >
        <div className="relative">
          <div className="h-20 sm:rounded-t-xl" style={{ background: `linear-gradient(120deg, hsl(${hue} 60% 60% / 0.28), hsl(${(hue + 40) % 360} 55% 60% / 0.16))` }} />
          <button className="icon-btn absolute right-2 top-2 bg-surface/70 backdrop-blur" onClick={closeProfile} aria-label="Close profile">
            <X size={20} />
          </button>
          <div className="px-5 -mt-12 flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="relative shrink-0 w-28">
              <div className="rounded-full ring-4 ring-surface bg-surface w-28 h-28 overflow-hidden">
                {person.photo && !hidden ? <img src={person.photo} alt="" className="w-28 h-28 object-cover" /> : <Silhouette sex={person.sex} size={112} />}
              </div>
              <button
                className="absolute -bottom-1 -right-1 h-9 px-2.5 rounded-full bg-surface border border-line shadow-soft text-xs font-medium flex items-center gap-1 hover:bg-subtle"
                onClick={() => fileRef.current?.click()}
                aria-label={person.photo ? 'Change photo' : 'Add photo'}
              >
                <Camera size={14} /> {person.photo ? 'Change' : 'Add photo'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </div>
            <div className="min-w-0 flex-1 pb-1 sm:pt-14">
              <h2 id={`${id}-name`} className="text-2xl font-bold leading-tight break-words" data-testid="profile-name">
                {person.title && !hidden ? <span className="text-muted font-medium text-lg">{person.title} </span> : null}
                {displayName(person, { privacy: publicView })}
              </h2>
              <div className="text-sm text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-1 items-center">
                {yearsLabel(person, { privacy: publicView }) && <span className="tabular-nums">{yearsLabel(person, { privacy: publicView })}</span>}
                {person.occupation && !hidden && <span>{person.occupation}</span>}
                {(person.birthSurname || person.surname) && (
                  <span className="chip" style={{ borderColor: `hsl(${hue} 50% 80%)` }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: `hsl(${hue} 55% 55%)` }} />
                    {person.birthSurname || person.surname} family
                  </span>
                )}
                {issues.length > 0 && !publicView && (
                  <span className="chip text-warn border-warn/40" title={issues.map((i) => i.message).join('\n')}>
                    {issues.length} check{issues.length > 1 ? 's' : ''} to review
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="px-5 mt-3 flex flex-wrap gap-1.5">
            <button className="btn-secondary h-9" onClick={() => setEditing(true)} data-testid="edit-person">
              <Pencil size={15} /> Edit details
            </button>
            <button
              className="btn-ghost h-9"
              onClick={() => {
                focus(person.id);
                closeProfile();
              }}
            >
              <Crosshair size={15} /> Centre tree here
            </button>
            {tree.homeId !== person.id && (
              <button className="btn-ghost h-9" onClick={() => commitWithToast(`Set ${fullName(person)} as home person`, (d) => void (d.homeId = person.id), 'Home person set')}>
                <Home size={15} /> Make home person
              </button>
            )}
            <button
              className="btn-ghost h-9"
              onClick={() => {
                closeProfile();
                setDialog({ type: 'relationship', a: person.id, b: tree.homeId !== person.id ? tree.homeId : undefined });
              }}
            >
              <GitCompareArrows size={15} /> How are we related?
            </button>
            <button
              className="btn-ghost h-9 text-danger"
              onClick={() =>
                setDialog({
                  type: 'confirm',
                  title: `Delete ${fullName(person)}?`,
                  message: 'They will be removed from the tree along with their links to family. You can undo this right after.',
                  confirmLabel: 'Delete person',
                  danger: true,
                  onConfirm: () => {
                    closeProfile();
                    commit(`Deleted ${fullName(person)}`, (d) => deletePerson(d, person.id));
                    toast({ message: `Deleted ${fullName(person)}`, undo: true });
                  },
                })
              }
            >
              <Trash2 size={15} /> Delete
            </button>
          </div>
          <div role="tablist" aria-label="Profile sections" className="px-3 mt-3 flex gap-1 overflow-x-auto border-b border-line" onKeyDown={onTabKey}>
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`${id}-tab-${t.id}`}
                role="tab"
                aria-selected={profile.tab === t.id}
                aria-controls={`${id}-panel`}
                tabIndex={profile.tab === t.id ? 0 : -1}
                className={`px-3 h-11 text-sm whitespace-nowrap border-b-2 -mb-px ${profile.tab === t.id ? 'border-accent text-ink font-semibold' : 'border-transparent text-muted hover:text-ink'}`}
                onClick={() => openProfile(person.id, t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${profile.tab}`} className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
          {profile.tab === 'about' && <AboutTab person={person} editing={editing} setEditing={setEditing} issues={issues} />}
          {profile.tab === 'family' && <FamilyTab person={person} />}
          {profile.tab === 'timeline' && <TimelineTab person={person} />}
          {profile.tab === 'media' && <MediaTab person={person} />}
          {profile.tab === 'links' && <LinksTab person={person} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { Avatar };
