import { ChevronLeft, ChevronRight, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { displayName, uid } from '../model/people';
import type { Story } from '../model/types';
import { commitWithToast, useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';
import { PersonPicker } from './PersonPicker';

export function StoriesDialog() {
  const tree = useStore((s) => s.tree)!;
  const { setDialog, setStory, focus } = useStore.getState();
  const [editing, setEditing] = useState<Story | null>(null);

  const play = (s: Story) => {
    if (!s.steps.length) return;
    setDialog(null);
    setStory({ id: s.id, step: 0 });
    focus(s.steps[0].personId);
  };

  if (editing) return <StoryEditor story={editing} onDone={() => setEditing(null)} />;
  return (
    <Dialog
      title="Stories"
      description="Guided tours that move from person to person with captions."
      onClose={() => setDialog(null)}
      footer={
        <button className="btn-primary" onClick={() => setEditing({ id: uid('st'), title: '', steps: [] })}>
          <Plus size={16} /> New story
        </button>
      }
    >
      <ul className="p-5 space-y-2">
        {tree.stories.map((s) => (
          <li key={s.id} className="card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{s.title || 'Untitled story'}</div>
              <div className="text-xs text-muted">{s.steps.length} steps</div>
            </div>
            <button className="btn-primary h-9" onClick={() => play(s)} disabled={!s.steps.length}>
              <Play size={15} /> Play
            </button>
            <button className="icon-btn" aria-label="Edit story" onClick={() => setEditing(s)}>
              <Pencil size={16} />
            </button>
            <button
              className="icon-btn"
              aria-label="Delete story"
              onClick={() =>
                commitWithToast('Deleted a story', (d) => {
                  d.stories = d.stories.filter((x) => x.id !== s.id);
                }, 'Story deleted')
              }
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
        {!tree.stories.length && <li className="text-sm text-muted text-center py-8">No stories yet. Create one to walk relatives through your family history.</li>}
      </ul>
    </Dialog>
  );
}

function StoryEditor({ story, onDone }: { story: Story; onDone: () => void }) {
  const tree = useStore((s) => s.tree)!;
  const [s, setS] = useState<Story>(structuredClone(story));
  const save = () => {
    commitWithToast(`Saved story “${s.title || 'Untitled'}”`, (d) => {
      const i = d.stories.findIndex((x) => x.id === s.id);
      const clean = { ...s, steps: s.steps.filter((st) => tree.people[st.personId]) };
      if (i >= 0) d.stories[i] = clean;
      else d.stories.push(clean);
    }, 'Story saved');
    onDone();
  };
  return (
    <Dialog
      title={story.title ? 'Edit story' : 'New story'}
      onClose={onDone}
      footer={
        <>
          <button className="btn-secondary" onClick={onDone}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save}>
            Save story
          </button>
        </>
      }
    >
      <div className="p-5 space-y-4">
        <div>
          <label className="label" htmlFor="st-title">
            Title
          </label>
          <input id="st-title" className="input" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} data-autofocus placeholder="e.g. Grandma’s journey" />
        </div>
        <ol className="space-y-3">
          {s.steps.map((st, i) => (
            <li key={i} className="card p-3 space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <PersonPicker label={`Step ${i + 1}`} value={st.personId} onChange={(id) => setS({ ...s, steps: s.steps.map((x, j) => (j === i ? { ...x, personId: id } : x)) })} />
                </div>
                <button className="icon-btn" aria-label="Remove step" onClick={() => setS({ ...s, steps: s.steps.filter((_, j) => j !== i) })}>
                  <Trash2 size={16} />
                </button>
              </div>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Caption"
                value={st.caption}
                aria-label={`Caption for step ${i + 1}`}
                onChange={(e) => setS({ ...s, steps: s.steps.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) })}
              />
            </li>
          ))}
        </ol>
        <button className="btn-secondary w-full" onClick={() => setS({ ...s, steps: [...s.steps, { personId: useStore.getState().selectedId ?? tree.homeId ?? '', caption: '' }] })}>
          <Plus size={16} /> Add step
        </button>
      </div>
    </Dialog>
  );
}

export function StoryPlayer() {
  const tree = useStore((s) => s.tree)!;
  const story = useStore((s) => s.story)!;
  const publicView = useStore((s) => s.publicView);
  const { setStory, focus } = useStore.getState();
  const s = tree.stories.find((x) => x.id === story.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!s) return;
      if (e.key === 'Escape') setStory(null);
      if (e.key === 'ArrowRight' && story.step < s.steps.length - 1) go(story.step + 1);
      if (e.key === 'ArrowLeft' && story.step > 0) go(story.step - 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  if (!s) return null;
  const step = s.steps[story.step];
  const go = (i: number) => {
    setStory({ id: s.id, step: i });
    focus(s.steps[i].personId);
  };
  const p = tree.people[step?.personId];
  return (
    <div className="fixed z-30 bottom-6 left-1/2 -translate-x-1/2 w-[min(100%-32px,560px)] card shadow-lift p-4 animate-pop no-print" role="region" aria-label="Story" aria-live="polite">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted">
          {s.title} · {story.step + 1} / {s.steps.length}
        </span>
        <button className="icon-btn h-8 w-8" onClick={() => setStory(null)} aria-label="End story">
          <X size={16} />
        </button>
      </div>
      {p && <div className="font-semibold">{displayName(p, { privacy: publicView })}</div>}
      <p className="text-[15px] mt-1 leading-relaxed">{step?.caption}</p>
      <div className="flex justify-between mt-3">
        <button className="btn-secondary h-9" disabled={story.step === 0} onClick={() => go(story.step - 1)}>
          <ChevronLeft size={16} /> Back
        </button>
        {story.step < s.steps.length - 1 ? (
          <button className="btn-primary h-9" onClick={() => go(story.step + 1)}>
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button className="btn-primary h-9" onClick={() => setStory(null)}>
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
