import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { updatePerson } from '../../model/ops';
import { fullName, isLiving, uid } from '../../model/people';
import type { MediaItem, Person } from '../../model/types';
import { commitWithToast, useStore } from '../../store/store';
import { readAsDataUrl, resizeImage } from '../../util/files';

export function MediaTab({ person }: { person: Person }) {
  const publicView = useStore((s) => s.publicView);
  const toast = useStore((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  if (publicView && isLiving(person)) return <p className="text-sm text-muted">Hidden in public view.</p>;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const items: MediaItem[] = [];
    for (const file of [...files]) {
      try {
        if (file.type.startsWith('image/')) items.push({ id: uid('m'), kind: 'image', data: await resizeImage(file, 1600) });
        else if (file.type.startsWith('audio/')) {
          if (file.size > 15_000_000) {
            toast({ message: `${file.name} is too large (max 15 MB).`, kind: 'error' });
            continue;
          }
          items.push({ id: uid('m'), kind: 'audio', data: await readAsDataUrl(file), caption: file.name.replace(/\.[^.]+$/, '') });
        }
      } catch {
        toast({ message: `Couldn’t read ${file.name}`, kind: 'error' });
      }
    }
    if (items.length)
      commitWithToast(`Added ${items.length} file(s) to ${fullName(person)}`, (d) => {
        d.people[person.id].media.push(...items);
      }, `Added ${items.length} file${items.length > 1 ? 's' : ''}`);
    if (fileRef.current) fileRef.current.value = '';
  };

  const setCaption = (id: string, caption: string) =>
    useStore.getState().commit('Edited a caption', (d) => {
      const m = d.people[person.id].media.find((x) => x.id === id);
      if (m) m.caption = caption || undefined;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">Photos and recordings stay on this device.</p>
        <button className="btn-secondary h-9" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={16} /> Add photos or audio
        </button>
        <input ref={fileRef} type="file" multiple accept="image/*,audio/*" className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>
      {person.media.length === 0 && (
        <button className="w-full border-2 border-dashed border-line rounded-lg p-8 text-sm text-muted hover:bg-subtle" onClick={() => fileRef.current?.click()}>
          No photos yet — add old photographs, documents or voice recordings.
        </button>
      )}
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {person.media.map((m) => (
          <li key={m.id} className="card overflow-hidden flex flex-col">
            {m.kind === 'image' ? (
              <img src={m.data} alt={m.caption ?? ''} className="w-full aspect-square object-cover bg-subtle" />
            ) : (
              <div className="p-3 bg-subtle">
                <audio controls src={m.data} className="w-full" />
              </div>
            )}
            <div className="p-2 space-y-1.5">
              <input
                className="input h-8 text-xs"
                defaultValue={m.caption ?? ''}
                placeholder="Add a caption"
                aria-label="Caption"
                onBlur={(e) => e.target.value !== (m.caption ?? '') && setCaption(m.id, e.target.value.trim())}
              />
              <div className="flex gap-1">
                {m.kind === 'image' && (
                  <button
                    className={`btn-ghost h-8 text-xs flex-1 ${person.photo === m.data ? 'text-accent' : ''}`}
                    onClick={() => commitWithToast('Set profile photo', (d) => updatePerson(d, person.id, { photo: m.data }), 'Profile photo set')}
                  >
                    <Star size={13} /> {person.photo === m.data ? 'Profile photo' : 'Use as profile'}
                  </button>
                )}
                <button
                  className="icon-btn h-8 w-8"
                  aria-label="Remove"
                  onClick={() =>
                    commitWithToast('Removed a file', (d) => {
                      const p = d.people[person.id];
                      p.media = p.media.filter((x) => x.id !== m.id);
                    }, 'Removed')
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
