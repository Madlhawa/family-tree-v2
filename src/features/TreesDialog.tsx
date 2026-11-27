import { Check, Copy, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';

export function TreesDialog() {
  const trees = useStore((s) => s.trees);
  const current = useStore((s) => s.tree);
  const { setDialog, openTree, duplicateTree, deleteTree, createTree, renameTree } = useStore.getState();
  const newTree = () =>
    setDialog({
      type: 'prompt',
      title: 'New tree',
      label: 'Name of the new tree',
      initial: 'My family',
      confirmLabel: 'Create tree',
      onConfirm: (name) => void createTree(name || 'My family'),
    });
  return (
    <Dialog
      title="Your trees"
      description="Each tree is saved separately on this device."
      onClose={() => setDialog(null)}
      footer={
        <>
          <button className="btn-secondary" onClick={() => setDialog({ type: 'importexport', tab: 'import' })}>
            <Upload size={16} /> Import into new tree
          </button>
          <button className="btn-primary" onClick={newTree} data-testid="new-tree">
            <Plus size={16} /> New tree
          </button>
        </>
      }
    >
      <ul className="p-3">
        {trees.map((t) => {
          const isCurrent = t.id === current?.id;
          return (
            <li key={t.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isCurrent ? 'bg-subtle' : ''}`}>
              <button
                className="flex-1 text-left min-w-0"
                onClick={() => {
                  setDialog(null);
                  if (!isCurrent) void openTree(t.id);
                }}
              >
                <span className="flex items-center gap-2 font-medium truncate">
                  {t.name} {isCurrent && <Check size={15} className="text-accent" aria-label="(open)" />}
                </span>
                <span className="block text-xs text-muted">
                  {t.peopleCount} people · edited {new Date(t.updatedAt).toLocaleDateString()}
                </span>
              </button>
              {isCurrent && (
                <button
                  className="icon-btn"
                  aria-label={`Rename ${t.name}`}
                  onClick={() =>
                    setDialog({ type: 'prompt', title: 'Rename tree', label: 'Tree name', initial: t.name, confirmLabel: 'Rename', onConfirm: (n) => n.trim() && renameTree(n.trim()) })
                  }
                >
                  <Pencil size={16} />
                </button>
              )}
              <button className="icon-btn" aria-label={`Duplicate ${t.name}`} onClick={() => void duplicateTree(t.id)}>
                <Copy size={16} />
              </button>
              <button
                className="icon-btn hover:text-danger"
                aria-label={`Delete ${t.name}`}
                onClick={() =>
                  setDialog({
                    type: 'confirm',
                    title: `Delete “${t.name}”?`,
                    message: `This permanently removes the tree and its ${t.peopleCount} people from this device. Download a backup first if you might want it back.`,
                    confirmLabel: 'Delete tree',
                    danger: true,
                    onConfirm: () => void deleteTree(t.id),
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </li>
          );
        })}
        {!trees.length && <li className="p-4 text-sm text-muted">No trees yet.</li>}
      </ul>
    </Dialog>
  );
}
