import { Redo2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { applyQuickEntry, parseQuickEntry, type QuickPerson } from '../model/quickentry';
import { displayName, fullName } from '../model/people';
import { useStore, type DialogState } from '../store/store';
import { Dialog } from '../ui/Dialog';

export function ConfirmDialog({ d }: { d: Extract<DialogState, { type: 'confirm' }> }) {
  const setDialog = useStore((s) => s.setDialog);
  return (
    <Dialog
      title={d.title}
      onClose={() => setDialog(null)}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={() => setDialog(null)} data-autofocus>
            Cancel
          </button>
          <button
            className={d.danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              setDialog(null);
              d.onConfirm();
            }}
            data-testid="confirm"
          >
            {d.confirmLabel}
          </button>
        </>
      }
    >
      <p className="p-5 text-sm">{d.message}</p>
    </Dialog>
  );
}

export function PromptDialog({ d }: { d: Extract<DialogState, { type: 'prompt' }> }) {
  const setDialog = useStore((s) => s.setDialog);
  const [v, setV] = useState(d.initial ?? '');
  const submit = () => {
    setDialog(null);
    d.onConfirm(v.trim());
  };
  return (
    <Dialog
      title={d.title}
      onClose={() => setDialog(null)}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={() => setDialog(null)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} data-testid="prompt-ok">
            {d.confirmLabel}
          </button>
        </>
      }
    >
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="label" htmlFor="prompt">
          {d.label}
        </label>
        <input id="prompt" className="input" value={v} onChange={(e) => setV(e.target.value)} data-autofocus onFocus={(e) => e.target.select()} data-testid="prompt-input" />
      </form>
    </Dialog>
  );
}

export function HistoryDialog() {
  const log = useStore((s) => s.log);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);
  const { setDialog, undo, redo } = useStore.getState();
  return (
    <Dialog
      title="History"
      description="Changes made since you opened this tree."
      onClose={() => setDialog(null)}
      footer={
        <>
          <button className="btn-secondary" onClick={undo} disabled={!past.length}>
            <Undo2 size={16} /> Undo
          </button>
          <button className="btn-secondary" onClick={redo} disabled={!future.length}>
            <Redo2 size={16} /> Redo
          </button>
        </>
      }
    >
      <ol className="p-5 space-y-2">
        {[...log].reverse().map((e, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <time className="text-xs text-muted tabular-nums w-14 shrink-0 pt-0.5">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            <span>{e.label}</span>
          </li>
        ))}
        {!log.length && <li className="text-sm text-muted">No changes yet.</li>}
      </ol>
    </Dialog>
  );
}

const EXAMPLE = `John Smith (M, 1870–1940, blacksmith)
spouse: Mary Jones (F, b. 1875)
children: Tom (1903), Rose (F, 1905)
father: William Smith (c. 1840)
mother: Ann (1845)`;

export function QuickEntryDialog({ personId }: { personId?: string }) {
  const tree = useStore((s) => s.tree)!;
  const { setDialog, commit, toast, focus } = useStore.getState();
  const anchor = personId ? tree.people[personId] : undefined;
  const [text, setText] = useState('');
  const plan = useMemo(() => parseQuickEntry(text), [text]);
  const needsMain = !plan.main && !anchor;
  const desc = (p: QuickPerson) => [p.sex !== 'unknown' ? p.sex : '', p.born && `b. ${p.born}`, p.died && `d. ${p.died}`, p.occupation].filter(Boolean).join(', ');
  const count = (plan.main ? 1 : 0) + plan.relatives.length;
  const apply = () => {
    try {
      const id = commit(`Quick entry: added ${count} people`, (d) => applyQuickEntry(d, plan, plan.main ? undefined : anchor?.id));
      toast({ message: `Added ${count} people`, undo: true, kind: 'success' });
      setDialog(null);
      focus(id);
    } catch (e) {
      toast({ message: (e as Error).message, kind: 'error' });
    }
  };
  const REL_WORD = { spouse: 'Partner', child: 'Child', parent: 'Parent', sibling: 'Sibling' } as const;
  return (
    <Dialog
      title="Quick entry"
      description={anchor ? `Type a family around ${displayName(anchor)}, or start with a new person’s name on the first line.` : 'Type or paste a whole family, then check the preview.'}
      onClose={() => setDialog(null)}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={() => setDialog(null)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!count || needsMain} onClick={apply} data-testid="quick-apply">
            Add {count || ''} {count === 1 ? 'person' : 'people'}
          </button>
        </>
      }
    >
      <div className="p-5 grid md:grid-cols-2 gap-5">
        <div>
          <label className="label" htmlFor="qe">
            Family
          </label>
          <textarea id="qe" className="textarea font-mono text-[13px]" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} data-autofocus data-testid="quick-text" />
          <button className="btn-ghost h-8 text-xs mt-1" onClick={() => setText(EXAMPLE)}>
            Use the example
          </button>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Keys: spouse, children, son, daughter, father, mother, parents, siblings, brother, sister. In brackets: M/F, a year or “1870–1940”, “b. 1903”, “d. 1950”, and an occupation.
          </p>
        </div>
        <div>
          <span className="label">Preview</span>
          <div className="rounded-lg border border-line p-3 min-h-[200px] text-sm space-y-1.5" aria-live="polite">
            {plan.main && (
              <div>
                <span className="text-muted">Person:</span> <strong>{[plan.main.given, plan.main.surname].filter(Boolean).join(' ')}</strong> <span className="text-muted">{desc(plan.main)}</span>
              </div>
            )}
            {!plan.main && anchor && (
              <div>
                <span className="text-muted">Person:</span> <strong>{fullName(anchor)}</strong> <span className="text-muted">(already in tree)</span>
              </div>
            )}
            {plan.relatives.map((r, i) => (
              <div key={i} className="pl-3">
                <span className="text-muted">{r.rel === 'parent' && r.parentRole ? (r.parentRole === 'father' ? 'Father' : 'Mother') : REL_WORD[r.rel]}:</span>{' '}
                <strong>{[r.person.given, r.person.surname].filter(Boolean).join(' ')}</strong> <span className="text-muted">{desc(r.person)}</span>
              </div>
            ))}
            {plan.errors.map((e, i) => (
              <div key={i} className="text-warn">
                {e}
              </div>
            ))}
            {needsMain && text.trim() && <div className="text-warn">Start with a line naming the main person.</div>}
            {!text.trim() && <div className="text-muted">Nothing yet.</div>}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ['P', 'Add a parent to the selected person'],
  ['S', 'Add a spouse / partner'],
  ['C', 'Add a child'],
  ['B', 'Add a brother or sister'],
  ['← ↑ → ↓', 'Walk the tree'],
  ['Enter', 'Open the profile'],
  ['/', 'Search'],
  ['F', 'Fit tree to screen'],
  ['H', 'Go to home person'],
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Y', 'Redo'],
  ['?', 'Show these shortcuts'],
  ['Esc', 'Close / cancel'],
];

export function ShortcutsDialog() {
  const setDialog = useStore((s) => s.setDialog);
  return (
    <Dialog title="Keyboard shortcuts" onClose={() => setDialog(null)} size="sm">
      <dl className="p-5 space-y-2">
        {SHORTCUTS.map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 text-sm">
            <dt className="w-24 shrink-0">
              <kbd className="border border-line rounded px-1.5 py-0.5 text-xs bg-subtle">{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
