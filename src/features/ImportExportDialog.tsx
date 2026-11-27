import { Download, FileJson, FileText, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { detectFormat, makeBackup, migrateLegacy, restoreBackup } from '../io/backup';
import { exportGedcom, importGedcom } from '../io/gedcom';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';
import { downloadText, readAsText, slug } from '../util/files';

export function ImportExportDialog({ tab: initial = 'export' }: { tab?: 'import' | 'export' }) {
  const tree = useStore((s) => s.tree);
  const { setDialog, importTree, toast, markBackedUp } = useStore.getState();
  const [tab, setTab] = useState<'import' | 'export'>(tree ? initial : 'import');
  const [redact, setRedact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await readAsText(file);
      const fmt = detectFormat(text);
      const base = file.name.replace(/\.[^.]+$/, '');
      if (fmt === 'gedcom') {
        const r = importGedcom(text, base);
        await importTree(r.tree, `Imported ${r.people} people from ${file.name}`);
        toast({ message: `Imported ${r.people} people and ${r.families} families into a new tree`, kind: 'success' });
        if (r.warnings.length) setReport(r.warnings.slice(0, 20));
        else setDialog(null);
      } else if (fmt === 'backup') {
        const t = restoreBackup(text);
        await importTree(t, `Restored backup ${file.name}`);
        toast({ message: `Restored “${t.name}” as a new tree`, kind: 'success' });
        setDialog(null);
      } else if (fmt === 'legacy') {
        const { tree: t, notes } = migrateLegacy(text);
        await importTree(t, `Imported Dynasty Chronicle backup ${file.name}`);
        toast({ message: `Imported ${Object.keys(t.people).length} people from Dynasty Chronicle`, kind: 'success' });
        setReport(notes);
      } else {
        toast({ message: 'This file type isn’t recognised. Use a GEDCOM (.ged) or JSON backup.', kind: 'error' });
      }
    } catch (e) {
      console.error(e);
      toast({ message: 'Sorry, that file could not be read.', kind: 'error' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const name = slug(tree?.name ?? 'family-tree');
  const date = new Date().toISOString().slice(0, 10);

  return (
    <Dialog title="Import & export" onClose={() => setDialog(null)}>
      <div className="px-5 pt-3">
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={tab === 'export'} onClick={() => setTab('export')} disabled={!tree}>
            Export / back up
          </button>
          <button role="tab" aria-selected={tab === 'import'} onClick={() => setTab('import')}>
            Import
          </button>
        </div>
      </div>
      {report ? (
        <div className="p-5 space-y-3">
          <p className="text-sm font-medium">Import finished with a few notes:</p>
          <ul className="text-sm text-muted list-disc pl-5 space-y-1">
            {report.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <button className="btn-primary" onClick={() => setDialog(null)}>
            Done
          </button>
        </div>
      ) : tab === 'export' && tree ? (
        <div className="p-5 space-y-4">
          <label className="flex items-start gap-3 rounded-lg border border-line p-3 cursor-pointer">
            <input type="checkbox" className="mt-1 w-4 h-4 accent-[rgb(var(--accent))]" checked={redact} onChange={(e) => setRedact(e.target.checked)} />
            <span>
              <span className="block text-sm font-medium">Redact living people</span>
              <span className="block text-xs text-muted">Replace names and details of living people with “Living” — good for sharing.</span>
            </span>
          </label>
          <button
            className="w-full card p-4 flex items-center gap-4 text-left hover:bg-subtle"
            onClick={() => {
              downloadText(`${name}-backup-${date}.json`, JSON.stringify(makeBackup(tree, { redactLiving: redact })), 'application/json');
              if (!redact) markBackedUp();
              toast({ message: 'Backup downloaded', kind: 'success' });
            }}
            data-testid="export-json"
          >
            <FileJson size={28} className="text-accent shrink-0" />
            <span className="flex-1">
              <span className="block font-medium">Full backup (.json)</span>
              <span className="block text-xs text-muted">Everything, including photos and stories. Restore it here any time.</span>
            </span>
            <Download size={18} className="text-muted" />
          </button>
          <button
            className="w-full card p-4 flex items-center gap-4 text-left hover:bg-subtle"
            onClick={() => {
              downloadText(`${name}-${date}.ged`, exportGedcom(tree, { redactLiving: redact }), 'text/plain');
              toast({ message: 'GEDCOM file downloaded', kind: 'success' });
            }}
            data-testid="export-gedcom"
          >
            <FileText size={28} className="text-accent shrink-0" />
            <span className="flex-1">
              <span className="block font-medium">GEDCOM 5.5.1 (.ged)</span>
              <span className="block text-xs text-muted">The standard format for other family tree programs. Photos are not included.</span>
            </span>
            <Download size={18} className="text-muted" />
          </button>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted">Imports always go into a new tree — your current tree is never overwritten.</p>
          <button
            className="w-full border-2 border-dashed border-line rounded-lg p-8 flex flex-col items-center gap-2 hover:bg-subtle"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload size={26} className="text-accent" />
            <span className="font-medium">{busy ? 'Importing…' : 'Choose a file or drop it here'}</span>
            <span className="text-xs text-muted">GEDCOM (.ged), a backup from this app (.json), or a Dynasty Chronicle backup (.json)</span>
          </button>
          <input ref={fileRef} type="file" accept=".ged,.gedcom,.json,application/json,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-file" />
        </div>
      )}
    </Dialog>
  );
}
